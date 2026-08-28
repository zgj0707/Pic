import { ipcMain, BrowserWindow, DownloadItem, shell } from 'electron'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, statSync, promises as fsPromises } from 'fs'
import { dbAdapter, saveDatabase } from '../services/database'
import { importPhotoToDatabase } from './import'
import { addTagToPhoto } from './tagManager'
import { getDownloadDir, setDownloadDir } from '../services/config'
import { getUniqueFilePath, isSupportedFile } from '../utils/fileSystem'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'
import type { IpcResponse } from '../types'

const activeDownloads: Map<string, DownloadItem> = new Map()

export function registerMaterialBrowserIpc(_mainWindow: BrowserWindow | null) {
  ipcMain.handle('material-browser:open-external', wrapHandler('material-browser:open-external',
    (_event, url: string) => {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { success: false, error: '仅支持打开网页来源' }
        }
        void shell.openExternal(parsed.toString())
        return { success: true }
      } catch {
        return { success: false, error: '来源网址无效' }
      }
    }
  ))

  ipcMain.handle('material-browser:get-download-dir', wrapHandler('material-browser:get-download-dir',
    () => getDownloadDir()
  ))

  ipcMain.handle('material-browser:set-download-dir', wrapHandler('material-browser:set-download-dir',
    (_event, dir: string) => {
      setDownloadDir(dir)
      return { success: true }
    }
  ))

  ipcMain.handle('material-browser:open-download-dir', wrapHandler('material-browser:open-download-dir',
    () => {
      const downloadDir = getDownloadDir()
      if (existsSync(downloadDir)) {
        shell.openPath(downloadDir)
      }
      return downloadDir
    }
  ))

  ipcMain.handle('material-browser:clear-download-cache', wrapAsyncHandler('material-browser:clear-download-cache',
    async () => {
      const downloadDir = getDownloadDir()
      if (existsSync(downloadDir)) {
        const referencedPaths = new Set(
          dbAdapter
            .query('SELECT filepath FROM photos WHERE filepath IS NOT NULL')
            .map(row => resolve(String(row.filepath)))
        )
        const files = await fsPromises.readdir(downloadDir)
        for (const file of files) {
          const filePath = join(downloadDir, file)
          const stat = await fsPromises.stat(filePath)
          if (stat.isFile() && !referencedPaths.has(resolve(filePath))) {
            await fsPromises.unlink(filePath)
          }
        }
      }
      return { success: true }
    }
  ))

  ipcMain.handle('material-browser:save-screenshot', wrapAsyncHandler('material-browser:save-screenshot',
    async (_event, imageData: Buffer | Uint8Array | string, filename: string): Promise<IpcResponse<{ filePath: string }>> => {
      const downloadDir = getDownloadDir()

      if (!existsSync(downloadDir)) {
        mkdirSync(downloadDir, { recursive: true })
      }

      const filePath = getUniqueFilePath(join(downloadDir, filename))

      let bufferData: Buffer
      if (Buffer.isBuffer(imageData)) {
        bufferData = imageData
      } else if (imageData instanceof Uint8Array) {
        bufferData = Buffer.from(imageData)
      } else if (typeof imageData === 'string') {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
        bufferData = Buffer.from(base64Data, 'base64')
      } else {
        return { success: false, error: 'Invalid image data format' }
      }

      const { Jimp } = await import('jimp')

      const image = await Jimp.read(bufferData)
      await (image as any).write(filePath, { quality: 95 })

      return { success: true, data: { filePath } }
    }
  ))

  ipcMain.handle('material-browser:import-to-library', wrapAsyncHandler('material-browser:import-to-library',
    async (_event, filePath: string, sourceUrl: string, tags: string[] = [], projectId?: number | null): Promise<IpcResponse<{ photoId: number; photo?: unknown; alreadyImported: boolean }>> => {
      if (projectId === null || projectId === undefined) {
        return { success: false, error: '请先创建或选择一个拍摄项目' }
      }
      if (!dbAdapter.get('SELECT id FROM projects WHERE id = ?', [projectId])) {
        return { success: false, error: '当前拍摄项目不存在，请重新选择项目' }
      }

      // Wait for file to be fully written (download in progress)
      let fileReady = false
      let retryCount = 0
      const maxRetries = 5

      while (!fileReady && retryCount < maxRetries) {
        try {
          if (existsSync(filePath)) {
            const stat = statSync(filePath)
            if (stat.size > 0) {
              fileReady = true
            } else {
              await new Promise(resolve => setTimeout(resolve, 300))
            }
          } else {
            await new Promise(resolve => setTimeout(resolve, 300))
          }
          retryCount++
        } catch {
          await new Promise(resolve => setTimeout(resolve, 300))
          retryCount++
        }
      }

      if (!fileReady) {
        return { success: false, error: '文件不存在或无法访问' }
      }

      const existing = dbAdapter.get('SELECT id FROM photos WHERE filepath = ? AND deleted_at IS NULL', [filePath])
      if (existing) {
        return { success: true, data: { photoId: existing.id, alreadyImported: true } }
      }

      const photo = await importPhotoToDatabase(filePath, projectId, { type: 'web', url: sourceUrl })

      if (photo) {
        // 缩略图改为按需生成，导入时不再同步生成

        // Add user-specified tags
        for (const tag of tags || []) {
          if (tag && tag.trim()) {
            addTagToPhoto(photo.id, tag.trim())
          }
        }

        photo.tags = (tags || []).filter(t => t && t.trim()).map(t => t.trim())

        saveDatabase()

        return { success: true, data: { photoId: photo.id, photo, alreadyImported: false } }
      }

      return { success: false, error: '导入失败' }
    }
  ))
}

export function setupDownloadHandler(mainWindow: BrowserWindow) {
  const webContents = mainWindow.webContents

  webContents.session.on('will-download', (event, item, _webContents) => {
    const fileName = item.getFilename()
    // Freeze the source at download start; the webview may navigate before completion.
    const sourceUrl = item.getURL() || _webContents?.getURL() || ''

    // Check if the download is an image file
    if (!isSupportedFile(fileName) && !/\.(gif)$/i.test(fileName)) {
      event.preventDefault()
      return
    }

    const downloadDir = getDownloadDir()
    const filePath = getUniqueFilePath(join(downloadDir, fileName))
    item.setSavePath(filePath)

    const downloadId = Date.now().toString()
    activeDownloads.set(downloadId, item)

    mainWindow?.webContents.send('material-browser:download-started', {
      id: downloadId,
      fileName,
      filePath,
      sourceUrl,
      totalBytes: item.getTotalBytes()
    })

    item.on('updated', (_event, state) => {
      if (state === 'progressing') {
        const received = item.getReceivedBytes()
        const total = item.getTotalBytes()
        mainWindow?.webContents.send('material-browser:download-progress', {
          id: downloadId,
          receivedBytes: received,
          totalBytes: total,
          percent: total > 0 ? Math.round((received / total) * 100) : 0
        })
      }
    })

    item.once('done', (_event, state) => {
      activeDownloads.delete(downloadId)

      if (state === 'completed') {
        const finalPath = item.getSavePath() || filePath
        mainWindow?.webContents.send('material-browser:download-complete', {
          id: downloadId,
          fileName,
          filePath: finalPath,
          sourceUrl
        })
      } else {
        mainWindow?.webContents.send('material-browser:download-failed', {
          id: downloadId,
          fileName,
          state
        })
      }
    })
  })
}
