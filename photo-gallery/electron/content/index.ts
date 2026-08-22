/**
 * Content Module Entry — the entire "content layer" of Pic.
 *
 * This module is BUNDLED by esbuild into a single self-contained
 * `modules/app.js` file that lives OUTSIDE the asar (next to the exe
 * for portable builds). Only `electron` and native npm deps are external.
 *
 * Because all business logic (IPC handlers, services, DB, utils) is bundled
 * into this one file, updating any feature = replacing just this file
 * (or the renderer) — no repackaging of the Electron shell required.
 *
 * The shell (main.ts) loads this module and calls its standard interface:
 *
 *   module.exports = {
 *     name, version,
 *     init(ctx),            // once, before window
 *     registerIpc(ctx),     // register all IPC handlers
 *     getRendererPath(ctx), // absolute path to index.html
 *     getRendererFallback(),// dev server URL fallback
 *     onWindowCreated(ctx), // after BrowserWindow exists
 *     onQuit(),             // persist DB before quit
 *     getWindowControls(ctx)// optional: handlers that need mainWindow
 *   }
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs'

// ─── Database (bundled — manages its own lifecycle) ───
import {
  initializeDatabase, closeDatabase, saveDatabase, dbAdapter
} from '../services/database'
import { loadConfig } from '../services/config'
import { enforceMaxCacheSize } from '../services/cacheManager'

// ─── IPC modules (all bundled here) ───
import { registerPhotoIpc } from '../ipc/photo'
import { registerAlbumIpc } from '../ipc/album'
import { registerImportIpc } from '../ipc/import'
import { registerRenameIpc } from '../ipc/rename'
import { registerTagManagerIpc } from '../ipc/tagManager'
import { registerExifToolIpc } from '../ipc/exifTool'
import { registerDeleteIpc } from '../ipc/delete'
import { registerMaterialBrowserIpc, setupDownloadHandler } from '../ipc/materialBrowser'

// ─── Services (cache manager, thumbnail, exif sync) ───
import { getCacheStats, clearThumbnailCache, cleanOldThumbnails, formatBytes } from '../services/cacheManager'
import { writeExifTags, closeExifTool } from '../ipc/exifTool'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'
import type { ChangelogEntry } from '../types'

export const name = 'pic-content'
export const version = '2.5.1'

// Content module capabilities (what the shell can rely on).
export const capabilities = {
  ipc: ['photos', 'albums', 'import', 'database', 'rename', 'tags', 'exif', 'delete', 'materialBrowser'],
  services: ['cache', 'changelog', 'window'],
  db: true
}

let _ctx: ContentContext | null = null
// mainWindow is managed by the shell via ContentContext.getMainWindow()
const _mainWindow: BrowserWindow | null = null

/**
 * Context injected by the shell — only Electron primitives + shared helpers
 * that the content module cannot own (e.g. mainWindow reference).
 */
export interface ContentContext {
  app: typeof import('electron').app
  BrowserWindow: typeof import('electron').BrowserWindow
  getMainWindow: () => BrowserWindow | null
  setMainWindow: (w: BrowserWindow | null) => void
  // runtime info
  appDataPath: string
  resourcesPath: string
  isPackaged: boolean
  portableDir: string | null
}

/**
 * Called by the shell BEFORE creating the window. Initializes DB + config.
 */
export async function init(c: ContentContext): Promise<void> {
  _ctx = c
  app.commandLine.appendSwitch('high-dpi-support', '1')
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling')

  loadConfig()
  try {
    await initializeDatabase(c.appDataPath)
    console.log('[content] Database initialized')
  } catch (e) {
    console.error('[content] Failed to init database:', e)
  }

  // 启动时异步检查并清理缩略图缓存，防止目录无限增长
  enforceMaxCacheSize()
    .then(result => {
      if (result.deleted > 0) {
        console.log(`[content] Cache limit enforced: deleted ${result.deleted} files, freed ${result.freedSpace} bytes`)
      }
    })
    .catch(e => console.error('[content] Cache limit enforcement failed:', e))
}

/**
 * Register ALL IPC handlers. Called by the shell after init.
 */
export function registerIpc(c: ContentContext): void {
  _ctx = c
  registerPhotoIpc()
  registerAlbumIpc()
  registerImportIpc(c.getMainWindow())
  registerRenameIpc()
  registerTagManagerIpc()
  registerExifToolIpc()
  registerDeleteIpc()
  registerMaterialBrowserIpc(c.getMainWindow())

  // ── Generic app/dialog/window/path/shell/cache handlers (moved from main.ts) ──
  registerGenericHandlers(c)
}

/**
 * Called by the shell after the BrowserWindow is created.
 * Wires up the download handler (needs webContents).
 */
export function onWindowCreated(c: ContentContext): void {
  const win = c.getMainWindow()
  if (win) {
    setupDownloadHandler(win)
  }
}

/**
 * Absolute path to the renderer (index.html). Resolves the external
 * modules dir first, falls back to the bundled copy in resources.
 */
export function getRendererPath(c: ContentContext): string {
  // External renderer (hot-updatable) — next to exe in portable builds
  const portableRenderer = c.portableDir
    ? join(c.portableDir, 'modules', 'renderer', 'index.html')
    : null
  if (portableRenderer && existsSync(portableRenderer)) {
    return portableRenderer
  }

  // Fallback 1: resources/modules (non-portable installs)
  const resourcesRenderer = join(c.resourcesPath, 'modules', 'renderer', 'index.html')
  if (existsSync(resourcesRenderer)) {
    return resourcesRenderer
  }

  // Fallback 2: bundled copy inside asar (dev / packaged fallback)
  return join(__dirname, '../renderer/index.html')
}

/**
 * Dev-mode fallback URL (used only in development).
 */
export function getRendererFallback(): string {
  return 'http://localhost:5173'
}

/**
 * Persist DB before quit.
 */
export async function onQuit(): Promise<void> {
  try { saveDatabase() } catch (e) { console.error('[content] save fail:', e) }
  try { await closeExifTool() } catch (e) { console.error('[content] exiftool close fail:', e) }
  try { closeDatabase() } catch (e) { console.error('[content] close fail:', e) }
}

/**
 * EXIF tag sync (moved from main.ts).
 */
export async function syncTagsToExif(): Promise<void> {
  console.log('[content] Starting EXIF tag synchronization...')
  try {
    const photos = dbAdapter.query('SELECT id, filepath FROM photos WHERE filepath IS NOT NULL AND deleted_at IS NULL')
    console.log(`[content] Found ${photos.length} photos to sync`)

    let synced = 0
    let failed = 0

    for (const photo of photos) {
      try {
        const tagsResult = dbAdapter.query(
          'SELECT t.name FROM tags t JOIN photo_tags pt ON t.id = pt.tag_id WHERE pt.photo_id = ?',
          [photo.id]
        )
        const tags = tagsResult.map(t => t.name)
        if (tags.length > 0) {
          const result = await writeExifTags(photo.filepath, tags)
          if (result.success) synced++
          else failed++
        }
      } catch (e) {
        console.error(`[content] EXIF sync fail ${photo.id}:`, e)
        failed++
      }
      if ((synced + failed) % 10 === 0) {
        console.log(`[content] Synced: ${synced}, Failed: ${failed}`)
      }
    }
    console.log(`[content] EXIF sync complete. Synced: ${synced}, Failed: ${failed}`)
  } catch (e) {
    console.error('[content] EXIF sync error:', e)
  }
}

// ─── Generic handlers previously inline in main.ts ───

function registerGenericHandlers(c: ContentContext): void {
  const electron = require('electron')

  ipcMain.handle('app:quit', wrapHandler('app:quit', () => {
    c.getMainWindow()?.close()
  }))

  ipcMain.handle('dialog:openDirectory', wrapAsyncHandler('dialog:openDirectory',
    async () => {
      const win = c.getMainWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      return result.filePaths[0] || null
    }
  ))

  ipcMain.handle('dialog:openFile', wrapAsyncHandler('dialog:openFile',
    async () => {
      const win = c.getMainWindow()
      if (!win) return []
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'tif', 'bmp'] }]
      })
      return result.filePaths
    }
  ))

  ipcMain.handle('path:join', wrapHandler('path:join', (_e, ...paths: string[]) => join(...paths)))
  ipcMain.handle('path:appData', wrapHandler('path:appData', () => app.getPath('userData')))

  ipcMain.handle('shell:showItemInFolder', wrapHandler('shell:showItemInFolder', (_e, filePath: string) => {
    if (!existsSync(filePath)) return { success: false, error: '文件不存在' }
    shell.showItemInFolder(filePath)
    return { success: true }
  }))

  ipcMain.handle('shell:openPath', wrapHandler('shell:openPath', (_e, filePath: string) => {
    if (!existsSync(filePath)) return { success: false, error: '文件不存在' }
    shell.openPath(filePath)
    return { success: true }
  }))

  ipcMain.handle('app:getVersionInfo', wrapHandler('app:getVersionInfo', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  })))

  // ─── Changelog: external JSON, editable without repackaging ───
  ipcMain.handle('app:getChangelog', wrapHandler('app:getChangelog', () => {
    const filePath = getChangelogPath(c)
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      try {
        const bundled = getBundledChangelogPath()
        if (bundled) return JSON.parse(readFileSync(bundled, 'utf-8'))
      } catch (e) { console.error('[content] changelog fallback fail:', e) }
      return []
    }
  }))

  // ─── Cache handlers ───
  ipcMain.handle('cache:getStats', wrapAsyncHandler('cache:getStats', async () => {
    const stats = await getCacheStats()
    return {
      totalSize: stats.totalSize,
      formattedSize: formatBytes(stats.totalSize),
      fileCount: stats.fileCount,
      oldestFile: stats.oldestFile,
      newestFile: stats.newestFile
    }
  }))
  ipcMain.handle('cache:clearAll', wrapAsyncHandler('cache:clearAll', async () => await clearThumbnailCache()))
  ipcMain.handle('cache:cleanOld', wrapAsyncHandler('cache:cleanOld', async () => await cleanOldThumbnails()))
  ipcMain.handle('cache:enforceLimit', wrapAsyncHandler('cache:enforceLimit', async () => await enforceMaxCacheSize()))

  // ─── Window controls ───
  ipcMain.handle('window:minimize', wrapHandler('window:minimize', () => c.getMainWindow()?.minimize()))
  ipcMain.handle('window:maximize', wrapHandler('window:maximize', () => {
    const win = c.getMainWindow()
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
  }))
  ipcMain.handle('window:close', wrapHandler('window:close', () => c.getMainWindow()?.close()))
  ipcMain.handle('window:isMaximized', wrapHandler('window:isMaximized', () => c.getMainWindow()?.isMaximized() ?? false))

  // ─── Photo file helpers ───
  ipcMain.handle('photos:copyToDesktopFolder', wrapAsyncHandler('photos:copyToDesktopFolder',
    async (_e, filePaths: string[], folderName: string) => {
      const desktopPath = app.getPath('desktop')
      const folderPath = join(desktopPath, folderName)
      if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true })
      let copied = 0, failed = 0
      for (const fp of filePaths) {
        try {
          if (existsSync(fp)) {
            copyFileSync(fp, join(folderPath, require('path').basename(fp)))
            copied++
          } else failed++
        } catch { failed++ }
      }
      return { success: true, folderPath, copied, failed }
    }
  ))

  ipcMain.handle('photos:copyImageToClipboard', wrapAsyncHandler('photos:copyImageToClipboard',
    async (_e, filePath: string) => {
      if (!existsSync(filePath)) return { success: false, error: '文件不存在' }
      const image = electron.nativeImage.createFromPath(filePath)
      if (image.isEmpty()) return { success: false, error: '无法读取图片' }
      electron.clipboard.writeImage(image)
      return { success: true }
    }
  ))
}

function getChangelogPath(c: ContentContext): string {
  // 便携版 exe 同级优先（用户可自由编辑，最高优先）
  if (c.portableDir) {
    const p = join(c.portableDir, 'changelog.json')
    if (existsSync(p)) return p
  }

  const userDataPath = join(app.getPath('userData'), 'changelog.json')
  const bundledPath = getBundledChangelogPath()

  // 首次运行：复制内置公告到 userData
  if (!existsSync(userDataPath)) {
    if (bundledPath) {
      try { copyFileSync(bundledPath, userDataPath) } catch (e) { console.error('[content] changelog copy fail:', e) }
    }
    return userDataPath
  }

  // userData 已有缓存：比较版本，若内置更新则合并新条目（保留用户已存在的记录）
  try {
    const userEntries = JSON.parse(readFileSync(userDataPath, 'utf-8'))
    const bundledEntries = bundledPath ? JSON.parse(readFileSync(bundledPath, 'utf-8')) : []
    const merged = mergeChangelogs(bundledEntries, userEntries)
    if (merged.length !== userEntries.length) {
      writeFileSync(userDataPath, JSON.stringify(merged, null, 2))
      console.log(`[content] Changelog synced: ${userEntries.length} → ${merged.length} entries`)
    }
  } catch (e) {
    console.error('[content] changelog sync fail:', e)
  }
  return userDataPath
}

/**
 * 解析内置 changelog 路径：
 * - 打包后：resources/changelog.json（extraResources 放入）
 * - 开发时：electron/changelog.json（源码目录）
 */
function getBundledChangelogPath(): string | null {
  if (app.isPackaged) {
    const p = join(process.resourcesPath, 'changelog.json')
    if (existsSync(p)) return p
  }
  const devPath = join(__dirname, '../../electron/changelog.json')
  return existsSync(devPath) ? devPath : null
}

/**
 * 合并两份 changelog 条目数组。
 * 以内置为准，但保留 userData 中已存在（可能被用户编辑过）的同版本条目。
 * 结果按版本号降序排列，按 version 去重。
 */
function mergeChangelogs(bundled: ChangelogEntry[], user: ChangelogEntry[]): ChangelogEntry[] {
  const map = new Map<string, ChangelogEntry>()
  for (const entry of [...bundled, ...user]) {
    if (entry && entry.version) {
      map.set(String(entry.version), entry)
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const cmp = compareVersions(b.version, a.version)
    return cmp
  })
}

/**
 * 比较两个版本号（支持 2.5.1 / 2.4 / 1.10.0 等格式）。
 * 返回正数表示 a > b，负数表示 a < b，0 表示相等。
 */
function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}
