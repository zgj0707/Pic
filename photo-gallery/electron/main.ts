/**
 * Pic — Electron Shell (bootstrap).
 *
 * This is the ONLY file that gets repackaged into the asar. It stays tiny
 * and stable. ALL business logic, IPC handlers, DB, and the renderer UI
 * live in the external "content module" (`modules/app.js` + `modules/renderer/`)
 * which can be updated without repackaging.
 *
 * The shell is responsible for:
 *   1. Resolving the external modules directory
 *   2. Loading `modules/app.js` (the bundled content module)
 *   3. Creating the BrowserWindow and driving the content module's lifecycle
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// ─── Content module (loaded lazily) ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let content: any = null

/**
 * Resolve the external modules directory, in priority order:
 *   1. Portable build: `<exe_dir>/modules` (hot-updatable, next to exe)
 *   2. Installed build: `<resources>/modules` (extraResources)
 *   3. Bundled fallback: `<asar>/dist-app/content` (dev / bundled copy)
 */
function resolveModulesDir(): { dir: string; isExternal: boolean } {
  // 1. Portable: exe sibling modules/
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const dir = join(process.env.PORTABLE_EXECUTABLE_DIR, 'modules')
    if (existsSync(join(dir, 'app.js'))) return { dir, isExternal: true }
  }

  // 2. Installed: resources/modules
  if (app.isPackaged) {
    const dir = join(process.resourcesPath, 'modules')
    if (existsSync(join(dir, 'app.js'))) return { dir, isExternal: true }
  }

  // 3. Dev fallback: dist-app/content (built alongside the shell)
  const devDir = join(__dirname, '../content')
  if (existsSync(join(devDir, 'app.js'))) return { dir: devDir, isExternal: false }

  // 4. Last resort: bundled inside asar dist-app/content
  return { dir: join(__dirname, '../content'), isExternal: false }
}

/**
 * Load the content module from the resolved modules directory.
 * Returns the module exports, or null if it cannot be found.
 */
function loadContentModule(): { exports: any; dir: string; isExternal: boolean } | null {
  const { dir, isExternal } = resolveModulesDir()
  const entry = join(dir, 'app.js')
  if (!existsSync(entry)) {
    console.error('[shell] Content module not found at', entry)
    return null
  }
  try {
     
    const exports = require(entry)
    console.log(`[shell] Content module loaded from ${isExternal ? 'external' : 'bundled'}: ${entry}`)
    return { exports, dir, isExternal }
  } catch (e) {
    console.error('[shell] Failed to load content module:', e)
    return null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    show: true,
    backgroundColor: '#1c1c1c',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      devTools: true,
      spellcheck: false,
      webviewTag: true
    }
  })

  // In dev, electron-vite sets ELECTRON_RENDERER_URL → prefer live dev server.
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl && !app.isPackaged) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // Load renderer from the content module (external path preferred)
    const rendererPath = content?.getRendererPath?.(ctx)
    const fallbackUrl = content?.getRendererFallback?.()

    if (rendererPath && existsSync(rendererPath)) {
      mainWindow.loadFile(rendererPath)
    } else if (fallbackUrl && !app.isPackaged) {
      mainWindow.loadURL(fallbackUrl)
      mainWindow.webContents.openDevTools()
    } else {
      // Last-resort bundled path
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (!isQuitting) {
      isQuitting = true
      app.quit()
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      isQuitting = true
      try { void content?.onQuit?.() } catch (e) { console.error('[shell] onQuit fail:', e) }
      setTimeout(() => app.exit(0), 100)
    }
  })

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  // Let content wire up download handlers once the window exists
  try { content?.onWindowCreated?.(ctx) } catch (e) { console.error('[shell] onWindowCreated fail:', e) }
}

// Context object passed to the content module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ctx: any = null

function buildContext(): any {
  return {
    app,
    BrowserWindow,
    getMainWindow: () => mainWindow,
    setMainWindow: (w: BrowserWindow | null) => { mainWindow = w },
    appDataPath: app.getPath('appData'),
    resourcesPath: app.isPackaged ? process.resourcesPath : '',
    isPackaged: app.isPackaged,
    portableDir: process.env.PORTABLE_EXECUTABLE_DIR || null,
    // Content-owned auxiliary windows (for example the screenshot overlay)
    // use the same hardened preload as the main window.
    preloadPath: join(__dirname, '../preload/preload.js')
  }
}

function cleanupAndQuit(): void {
  if (isQuitting) return
  isQuitting = true

  try { void content?.onQuit?.() } catch (e) { console.error('[shell] quit fail:', e) }

  setTimeout(() => {
    BrowserWindow.getAllWindows().forEach(w => w.destroy())
    setTimeout(() => app.exit(0), 100)
  }, 50)
}

app.whenReady().then(async () => {
  const loaded = loadContentModule()
  if (!loaded) {
    console.error('[shell] Fatal: could not load content module')
    app.quit()
    return
  }
  content = loaded.exports
  ctx = buildContext()

  try {
    await content.init?.(ctx)
    console.log('[shell] Content init OK')
  } catch (e) {
    console.error('[shell] Content init error:', e)
  }

  try {
    content.registerIpc?.(ctx)
    console.log('[shell] IPC registered')
  } catch (e) {
    console.error('[shell] IPC register error:', e)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) createWindow()
  })
})

app.on('window-all-closed', () => cleanupAndQuit())
app.on('before-quit', () => cleanupAndQuit())
app.on('will-quit', () => cleanupAndQuit())
