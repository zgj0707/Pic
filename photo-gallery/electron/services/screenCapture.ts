import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen } from 'electron'
import { dirname, join } from 'path'
import { promises as fsPromises } from 'fs'
import { existsSync } from 'fs'
import { getDownloadDir } from './config'
import { dbAdapter, saveDatabase } from './database'
import { importPhotoToDatabase } from '../ipc/import'
import { getUniqueFilePath } from '../utils/fileSystem'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'

export interface ScreenCaptureContext {
  getMainWindow: () => BrowserWindow | null
  preloadPath: string
}

interface CapturePayload {
  imageData: Buffer | Uint8Array | ArrayBuffer | string
}

const HOTKEY = 'Alt+A'
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MIN_CAPTURE_SIZE = 12
let captureContext: ScreenCaptureContext | null = null
let overlayPath = ''
let overlayWindow: BrowserWindow | null = null
let targetProjectId: number | null = null
let hotkeyRegistered = false
const hotkeyGuardHandlers = new Map<Electron.WebContents, (event: Electron.Event, input: Electron.Input) => void>()
let activeDisplayConfig: {
  displayId: string
  physicalWidth: number
  physicalHeight: number
} | null = null

function sendToMain(channel: string, payload: unknown): void {
  captureContext?.getMainWindow()?.webContents.send(channel, payload)
}

function closeOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
  activeDisplayConfig = null
}

function isOverlaySender(senderId: number): boolean {
  return Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents.id === senderId)
}

function normalizeImageData(input: unknown): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input)
  if (input instanceof ArrayBuffer) return Buffer.from(input)
  if (typeof input === 'string') {
    const base64 = input.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
    return Buffer.from(base64, 'base64')
  }
  throw new Error('截图数据格式无效')
}

function notifyFailure(error: string): void {
  sendToMain('capture:error', { error })
}

function isScreenshotHotkey(input: Electron.Input): boolean {
  return input.type === 'keyDown' && input.key.toLowerCase() === 'a' && input.alt &&
    !input.control && !input.shift && !input.meta
}

function guardHotkeyInContents(contents: Electron.WebContents): void {
  if (hotkeyGuardHandlers.has(contents)) return
  const handler = (event: Electron.Event, input: Electron.Input) => {
    if (isScreenshotHotkey(input)) event.preventDefault()
  }
  contents.on('before-input-event', handler)
  hotkeyGuardHandlers.set(contents, handler)
}

function unguardHotkeyInContents(contents: Electron.WebContents): void {
  const handler = hotkeyGuardHandlers.get(contents)
  if (handler) contents.removeListener('before-input-event', handler)
  hotkeyGuardHandlers.delete(contents)
}

function handleNewWebContents(_event: Electron.Event, contents: Electron.WebContents): void {
  guardHotkeyInContents(contents)
}

async function beginCapture(): Promise<{ success: boolean; error?: string }> {
  if (!captureContext) return { success: false, error: '截图功能尚未初始化' }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus()
    return { success: true }
  }
  if (targetProjectId === null) {
    const error = '请先在 Pic 中创建或选择一个项目'
    notifyFailure(error)
    return { success: false, error }
  }
  if (!existsSync(overlayPath)) {
    const error = '截图界面资源不存在，请重新构建 Pic'
    notifyFailure(error)
    return { success: false, error }
  }

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const bounds = display.bounds
  const scale = display.scaleFactor || 1
  const physicalWidth = Math.max(1, Math.round(bounds.width * scale))
  const physicalHeight = Math.max(1, Math.round(bounds.height * scale))
  activeDisplayConfig = {
    displayId: String(display.id),
    physicalWidth,
    physicalHeight
  }

  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: captureContext.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false
    }
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow = overlay

  overlay.on('closed', () => {
    if (overlayWindow === overlay) overlayWindow = null
  })
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  overlay.webContents.on('did-fail-load', (_event, _code, description) => {
    notifyFailure('截图界面加载失败：' + (description || '未知错误'))
    closeOverlay()
  })

  try {
    // Load without query parameters; the overlay requests this config through
    // the authenticated preload IPC after the local file is ready.
    await overlay.loadFile(overlayPath)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    notifyFailure('无法打开截图界面：' + message)
    closeOverlay()
    return { success: false, error: message }
  }
}

async function saveCaptureToLibrary(event: Electron.IpcMainInvokeEvent, payload: CapturePayload) {
  if (!isOverlaySender(event.sender.id)) {
    return { success: false, error: '截图请求来源无效' }
  }
  if (targetProjectId === null) {
    return { success: false, error: '请先在 Pic 中创建或选择一个项目' }
  }
  if (!dbAdapter.get('SELECT id FROM projects WHERE id = ?', [targetProjectId])) {
    return { success: false, error: '当前项目不存在，请重新选择项目' }
  }

  const buffer = normalizeImageData(payload?.imageData)
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { success: false, error: '截图大小无效（最大 25 MB）' }
  }

  const image = nativeImage.createFromBuffer(buffer)
  if (image.isEmpty()) {
    return { success: false, error: '无法解析截图图片' }
  }
  const dimensions = image.getSize()
  if (dimensions.width < MIN_CAPTURE_SIZE || dimensions.height < MIN_CAPTURE_SIZE) {
    return { success: false, error: '截图区域太小，请重新框选' }
  }

  let clipboardCopied = false
  let clipboardError: string | undefined
  try {
    clipboard.writeImage(image)
    clipboardCopied = true
  } catch (error) {
    clipboardError = error instanceof Error ? error.message : String(error)
    console.warn('[capture] Failed to copy screenshot to clipboard:', clipboardError)
  }

  const downloadDir = getDownloadDir()
  await fsPromises.mkdir(downloadDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const filePath = getUniqueFilePath(join(downloadDir, 'pic-screenshot-' + stamp + '.png'))

  try {
    await fsPromises.writeFile(filePath, buffer)
    const photo = await importPhotoToDatabase(filePath, targetProjectId, {
      type: 'local',
      note: 'Pic 截图'
    })
    if (!photo) throw new Error('截图未能写入样片库')

    saveDatabase()
    const savedPhoto = dbAdapter.get('SELECT * FROM photos WHERE id = ?', [photo.id])
    sendToMain('capture:saved', {
      projectId: targetProjectId,
      photoId: photo.id,
      photo: savedPhoto,
      clipboardCopied,
      clipboardError
    })
    closeOverlay()
    return {
      success: true,
      data: {
        photoId: photo.id,
        projectId: targetProjectId,
        filePath,
        width: dimensions.width,
        height: dimensions.height,
        clipboardCopied,
        clipboardError
      }
    }
  } catch (error) {
    try { await fsPromises.unlink(filePath) } catch { /* best effort cleanup */ }
    throw error
  }
}

function copyCaptureToClipboard(event: Electron.IpcMainInvokeEvent, payload: CapturePayload) {
  if (!isOverlaySender(event.sender.id)) {
    return { success: false, error: '截图请求来源无效' }
  }
  const buffer = normalizeImageData(payload?.imageData)
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { success: false, error: '截图大小无效（最大 25 MB）' }
  }
  const image = nativeImage.createFromBuffer(buffer)
  if (image.isEmpty()) return { success: false, error: '无法解析截图图片' }
  const dimensions = image.getSize()
  if (dimensions.width < MIN_CAPTURE_SIZE || dimensions.height < MIN_CAPTURE_SIZE) {
    return { success: false, error: '截图区域太小，请重新框选' }
  }
  clipboard.writeImage(image)
  return { success: true }
}

export function registerScreenCapture(context: ScreenCaptureContext, rendererPath: string): void {
  captureContext = context
  overlayPath = join(dirname(rendererPath), 'screenshot-overlay.html')
  const mainWindow = captureContext.getMainWindow()
  if (mainWindow) guardHotkeyInContents(mainWindow.webContents)
  app.on('web-contents-created', handleNewWebContents)

  ipcMain.handle('capture:set-target-project', wrapHandler('capture:set-target-project',
    (_event, projectId: number | null) => {
      if (projectId === null) {
        targetProjectId = null
      } else if (Number.isInteger(projectId) && projectId > 0) {
        targetProjectId = projectId
      } else {
        return { success: false, error: '项目编号无效' }
      }
      return { success: true }
    }
  ))

  ipcMain.handle('capture:trigger', wrapAsyncHandler('capture:trigger', async () => beginCapture()))
  ipcMain.handle('capture:get-hotkey-status', wrapHandler('capture:get-hotkey-status',
    () => ({
      success: true,
      data: {
        hotkey: HOTKEY,
        registered: hotkeyRegistered,
        conflict: !hotkeyRegistered
      }
    })
  ))

  ipcMain.handle('capture:get-screen', wrapAsyncHandler('capture:get-screen',
    async (event, displayId: string, width: number, height: number) => {
      if (!isOverlaySender(event.sender.id)) return { success: false, error: '截图界面来源无效' }
      const safeWidth = Math.max(1, Math.min(Math.round(Number(width) || 1920), 10000))
      const safeHeight = Math.max(1, Math.min(Math.round(Number(height) || 1080), 10000))
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: safeWidth, height: safeHeight },
        fetchWindowIcons: false
      })
      const source = sources.find(item => String(item.display_id) === String(displayId)) || sources[0]
      if (!source || source.thumbnail.isEmpty()) {
        return { success: false, error: '无法捕获当前显示器' }
      }
      const png = source.thumbnail.toPNG()
      return { success: true, data: 'data:image/png;base64,' + Buffer.from(png).toString('base64') }
    }
  ))
  ipcMain.handle('capture:get-config', wrapHandler('capture:get-config',
    (event) => {
      if (!isOverlaySender(event.sender.id) || !activeDisplayConfig) {
        return { success: false, error: '截图界面来源无效' }
      }
      return { success: true, data: activeDisplayConfig }
    }
  ))

  ipcMain.handle('capture:overlay-ready', wrapHandler('capture:overlay-ready',
    (event) => {
      if (!isOverlaySender(event.sender.id)) return { success: false, error: '截图界面来源无效' }
      overlayWindow?.show()
      overlayWindow?.focus()
      return { success: true }
    }
  ))

  ipcMain.handle('capture:cancel', wrapHandler('capture:cancel',
    (event) => {
      if (!isOverlaySender(event.sender.id)) return { success: false, error: '截图界面来源无效' }
      closeOverlay()
      return { success: true }
    }
  ))

  ipcMain.handle('capture:report-error', wrapHandler('capture:report-error',
    (event, error: string) => {
      if (!isOverlaySender(event.sender.id)) return { success: false, error: '截图界面来源无效' }
      notifyFailure(typeof error === 'string' ? error : '截图失败')
      closeOverlay()
      return { success: true }
    }
  ))

  ipcMain.handle('capture:save-to-library', wrapAsyncHandler('capture:save-to-library',
    (event, payload: CapturePayload) => saveCaptureToLibrary(event, payload)
  ))
  ipcMain.handle('capture:copy-to-clipboard', wrapHandler('capture:copy-to-clipboard',
    (event, payload: CapturePayload) => copyCaptureToClipboard(event, payload)
  ))

  const registerResult = globalShortcut.register(HOTKEY, () => { void beginCapture() })
  hotkeyRegistered = registerResult
  if (!registerResult) {
    console.warn('[capture] Global shortcut unavailable: ' + HOTKEY)
  } else {
    console.log('[capture] Global shortcut registered: ' + HOTKEY)
  }
}

export function setCaptureTargetProject(projectId: number | null): void {
  targetProjectId = Number.isInteger(projectId) && Number(projectId) > 0 ? Number(projectId) : null
}

export function disposeScreenCapture(): void {
  if (hotkeyRegistered) {
    globalShortcut.unregister(HOTKEY)
    hotkeyRegistered = false
  }
  if (typeof app.off === 'function') {
    app.off('web-contents-created', handleNewWebContents)
  } else if (typeof app.removeListener === 'function') {
    app.removeListener('web-contents-created', handleNewWebContents)
  }
  for (const contents of hotkeyGuardHandlers.keys()) unguardHotkeyInContents(contents)
  closeOverlay()
  captureContext = null
  targetProjectId = null
}
