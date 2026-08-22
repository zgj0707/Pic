import { ipcMain } from 'electron'
import { dbAdapter, saveDatabase } from '../services/database'
import { existsSync } from 'fs'
import { basename } from 'path'
import { generateThumbnail } from '../services/thumbnail'
import { getCacheDir } from '../services/cacheManager'
import exifr from 'exifr'
import { isSupportedFile, scanDirectory, getValidFileStat } from '../utils/fileSystem'
import { wrapAsyncHandler } from '../utils/ipcHandler'
import type { ImportProgress, ImportResult } from '../types'

let importProgress: ImportProgress = {
  total: 0,
  current: 0,
  status: 'idle',
  message: ''
}

/**
 * Import a single photo file into the database.
 * Extracts EXIF metadata and generates a database record.
 *
 * @returns The photo record if imported, or with alreadyImported=true if duplicate.
 *          Returns null if the file is unsupported or invalid.
 */
export async function importPhotoToDatabase(filePath: string): Promise<{ id: number; filename: string; filepath: string; rating: number; tags: string[]; alreadyImported: boolean } | null> {
  if (!isSupportedFile(filePath) || !existsSync(filePath)) {
    return null
  }

  const statInfo = getValidFileStat(filePath)
  if (!statInfo) return null

  const existing = dbAdapter.get('SELECT id FROM photos WHERE filepath = ?', [filePath])
  if (existing) {
    return { id: existing.id, filename: '', filepath: filePath, rating: 0, tags: [], alreadyImported: true }
  }

  const filename = basename(filePath)

  let width = 0
  let height = 0
  let createdAt = Math.floor(statInfo.mtime.getTime() / 1000)
  let exifJson: string | null = null

  try {
    const exif = await exifr.parse(filePath, { iptc: true, exif: true, gps: false })
    if (exif) {
      exifJson = JSON.stringify(exif)
      if (exif.DateTimeOriginal) {
        createdAt = Math.floor(new Date(exif.DateTimeOriginal).getTime() / 1000)
      }
      if (exif.ImageWidth) width = exif.ImageWidth
      if (exif.ImageHeight) height = exif.ImageHeight
      if (exif.ExifImageWidth) width = exif.ExifImageWidth
      if (exif.ExifImageHeight) height = exif.ExifImageHeight
    }
  } catch {
    // EXIF parsing is best-effort; fall back to file mtime
  }

  const photoId = dbAdapter.insert('photos', {
    filename,
    filepath: filePath,
    filesize: statInfo.size,
    width,
    height,
    created_at: createdAt,
    exif_json: exifJson
  })

  if (photoId !== null) {
    return { id: photoId, filename, filepath: filePath, rating: 0, tags: [], alreadyImported: false }
  }

  return null
}

/**
 * Generate thumbnails for a batch of photos.
 * Updates the progress tracker and database as it goes.
 */
async function generateThumbnailsForPhotos(
  photosToProcess: { id: number; filepath: string }[],
  thumbDir: string
): Promise<number> {
  let generated = 0
  for (let i = 0; i < photosToProcess.length; i++) {
    const photo = photosToProcess[i]
    importProgress.current = i + 1
    importProgress.message = `生成缩略图中... ${i + 1}/${photosToProcess.length}`

    try {
      const thumbPath = await generateThumbnail(photo.filepath, photo.id, thumbDir, 300, 200)
      dbAdapter.run('UPDATE photos SET thumbnail_path = ? WHERE id = ?', [thumbPath, photo.id])
      generated++
    } catch {
      // thumbnail generation errors are non-fatal
    }
  }
  return generated
}

/**
 * Core import logic shared by import:fromDirectory and import:fromFiles.
 */
async function performImport(
  filePaths: string[],
  statusLabel: string
): Promise<ImportResult> {
  importProgress = { total: 0, current: 0, status: 'scanning', message: '扫描文件中...' }
  importProgress.total = filePaths.length
  importProgress.status = 'importing'
  importProgress.message = `${statusLabel}... 0/${filePaths.length}`

  let imported = 0
  let skipped = 0
  const newPhotos: { id: number; filepath: string }[] = []

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    importProgress.current = i + 1
    importProgress.message = `${statusLabel}... ${i + 1}/${filePaths.length} (新增: ${imported}, 跳过: ${skipped})`

    const photo = await importPhotoToDatabase(filePath)
    if (photo) {
      if (photo.alreadyImported) {
        skipped++
      } else {
        imported++
        newPhotos.push({ id: photo.id, filepath: filePath })
      }
    }
  }

  let thumbnailsGenerated = 0
  if (newPhotos.length > 0) {
    const thumbDir = getCacheDir()
    importProgress.status = 'generating_thumbnails'
    importProgress.total = newPhotos.length
    importProgress.current = 0
    importProgress.message = `生成缩略图中... 0/${newPhotos.length}`

    thumbnailsGenerated = await generateThumbnailsForPhotos(newPhotos, thumbDir)
  }

  let message = `完成，新增 ${imported} 张`
  if (skipped > 0) message += `，跳过 ${skipped} 张重复`
  if (thumbnailsGenerated > 0) message += `，生成 ${thumbnailsGenerated} 张缩略图`

  importProgress.status = 'done'
  importProgress.message = message

  return { success: true, imported, skipped, thumbnailsGenerated, total: filePaths.length }
}

export function registerImportIpc(): void {
  ipcMain.handle('import:fromDirectory', wrapAsyncHandler('import:fromDirectory',
    async (_event, dirPath: string): Promise<ImportResult> => {
      const filePaths = scanDirectory(dirPath)
      const result = await performImport(filePaths, '导入中')

      dbAdapter.insert('import_history', {
        source_path: dirPath,
        imported_count: result.imported
      })

      return result
    }
  ))

  ipcMain.handle('import:fromFiles', wrapAsyncHandler('import:fromFiles',
    async (_event, filePaths: string[]): Promise<ImportResult> => {
      return await performImport(filePaths, '导入中')
    }
  ))

  ipcMain.handle('import:getProgress', () => {
    return importProgress
  })
}
