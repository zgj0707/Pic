/**
 * Headless smoke test for the modular architecture — runs in plain Node
 * with a mocked `electron` module, loading the REAL bundled content module
 * (dist-app/content/app.js). Verifies:
 *   - artifacts exist
 *   - content module exports the shell contract
 *   - init() + registerIpc() register all expected IPC channels
 *   - getRendererPath() resolves to an existing file
 *
 * Run: node test-smoke.cjs   (uses the managed Node, not Electron)
 */

const path = require('path')
const fs = require('fs')

// ─── Mock electron (only what content/index.ts touches at load+register time) ───
const ipcMainHandlers = new Map()

function makeMockElectron() {
  const app = {
    commandLine: { appendSwitch: () => {} },
    getPath: (name) => path.join(process.env.TEMP || '/tmp', 'pic-smoke-' + name),
    getName: () => 'Pic',
    getVersion: () => '2.4.0-test',
    isPackaged: false
  }
  const ipcMain = {
    handle: (channel, handler) => { ipcMainHandlers.set(channel, handler) },
    _invokeHandlers: ipcMainHandlers
  }
  return {
    app,
    ipcMain,
    BrowserWindow: class BrowserWindow {},
    dialog: { showOpenDialog: async () => ({ filePaths: [] }) },
    shell: { showItemInFolder: () => {}, openPath: async () => '' },
    clipboard: { writeImage: () => {} },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }
  }
}

const mockElectron = makeMockElectron()

// Make `require('electron')` resolve to the mock for the content module.
// The bundled app.js calls require('electron') — patch Module._load.
const Module = require('module')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return mockElectron
  return originalLoad.apply(this, arguments)
}

const root = __dirname
const results = []

function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`)
}

async function main() {
  // 1. Artifacts
  check('shell main.js exists', fs.existsSync(path.join(root, 'dist-app/main/main.js')))
  check('preload.js exists', fs.existsSync(path.join(root, 'dist-app/preload/preload.js')))
  check('content app.js exists', fs.existsSync(path.join(root, 'dist-app/content/app.js')))
  check('content modules.json exists', fs.existsSync(path.join(root, 'dist-app/content/modules.json')))
  check('renderer index.html exists', fs.existsSync(path.join(root, 'dist-app/content/renderer/index.html')))

  // 2. Load content module
  const content = require(path.join(root, 'dist-app/content/app.js'))
  const contract = ['init', 'registerIpc', 'getRendererPath', 'getRendererFallback', 'onWindowCreated', 'onQuit', 'syncTagsToExif', 'name', 'version']
  for (const key of contract) {
    check(`content exports ${key}`, content[key] !== undefined, typeof content[key])
  }

  // 3. init + registerIpc
  const ctx = {
    app: mockElectron.app,
    BrowserWindow: mockElectron.BrowserWindow,
    getMainWindow: () => null,
    setMainWindow: () => {},
    appDataPath: path.join(process.env.TEMP || '/tmp', 'pic-smoke-appdata'),
    resourcesPath: '',
    isPackaged: false,
    portableDir: null
  }
  await content.init(ctx)
  check('content.init OK', true)

  content.registerIpc(ctx)
  check('content.registerIpc OK', true)

  // 4. Verify IPC channels
  const expected = [
    'photos:getAll', 'photos:getById', 'photos:updateRating', 'photos:toggleFavorite',
    'photos:updateTags', 'photos:delete', 'photos:getTags', 'photos:generateThumbnails',

    'albums:getAll', 'albums:create', 'albums:rename', 'albums:delete', 'albums:addPhotos', 'albums:removePhotos',
    'import:fromDirectory', 'import:fromFiles', 'import:getProgress',
    'rename:batch', 'rename:preview', 'rename:selectOutputDir',
    'tags:getAll', 'tags:create', 'tags:delete', 'tags:getByPhoto', 'tags:addToPhoto', 'tags:removeFromPhoto', 'tags:getAllWithCounts',
    'exif:getExifData', 'exif:writeRating', 'exif:writeTags', 'exif:batchWriteTags', 'exif:writeExifData', 'exif:getAllUsedTags',
    'photos:openInExplorer',
    'material-browser:open-external', 'material-browser:get-download-dir', 'material-browser:set-download-dir',
    'material-browser:open-download-dir', 'material-browser:clear-download-cache', 'material-browser:save-screenshot',
    'material-browser:import-to-library',
    'project-references:getAll', 'project-references:add', 'project-references:remove', 'project-references:export',
    'app:quit', 'dialog:openDirectory', 'dialog:openFile', 'path:join', 'path:appData',
    'shell:showItemInFolder', 'shell:openPath', 'app:getVersionInfo', 'app:getChangelog',
    'cache:getStats', 'cache:clearAll', 'cache:cleanOld', 'cache:enforceLimit',
    'window:minimize', 'window:maximize', 'window:close', 'window:isMaximized',
    'photos:copyToDesktopFolder', 'photos:exportToPdf', 'photos:copyImageToClipboard'
  ]
  let missing = 0
  for (const ch of expected) {
    const ok = ipcMainHandlers.has(ch)
    if (!ok) missing++
    check(`IPC: ${ch}`, ok)
  }
  console.log(`\n${expected.length - missing}/${expected.length} IPC channels registered`)

  // 5. getRendererPath resolves to existing file
  const rp = content.getRendererPath(ctx)
  check('getRendererPath resolves', !!rp && fs.existsSync(rp), rp)

  // 6. onQuit
  await content.onQuit()
  check('onQuit OK', true)

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
