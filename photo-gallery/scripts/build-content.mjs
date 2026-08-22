/**
 * Content layer build script.
 *
 * Bundles ALL business logic (IPC + services + DB + utils + types) into a
 * single self-contained `modules/app.js` (CommonJS), copies the renderer to
 * `modules/renderer/`, and writes `modules/modules.json` (manifest).
 *
 * Only `electron` and native/heavy npm deps (sql.js, exiftool-vendored,
 * exifr, jimp, sharp) are external — they resolve from node_modules at
 * runtime (asarUnpack handles the native binaries).
 *
 * Run: `node scripts/build-content.mjs` after `npm run build`
 * Output: dist-app/content/ (staged for extraResources → resources/modules)
 */

import { build } from 'esbuild'
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const contentEntry = join(root, 'electron/content/index.ts')
const rendererSource = join(root, 'dist-app/renderer')
const outDir = join(root, 'dist-app/content')
const outEntry = join(outDir, 'app.js')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version || '0.0.0'

// Output set is deterministic — just mkdir, no deletion needed.
mkdirSync(outDir, { recursive: true })

// External deps — these stay in node_modules (native or heavy).
const external = [
  'electron',
  'sql.js',
  'exiftool-vendored',
  'exifr',
  'jimp',
  'sharp'
]

console.log(`[content] Bundling content module v${version}...`)

// Banner injected at the top of the bundle.
// The content module lives OUTSIDE the asar (resources/modules or exe-adjacent).
// Standard Node resolution would not find deps that live inside app.asar's
// node_modules, so we augment module.paths to include them. Electron's require
// transparently resolves paths that go through app.asar.
const banner = `// Pic content module (auto-generated). Do not edit.
const _nodePath = require('path');
const _res = typeof process !== 'undefined' && process.resourcesPath ? process.resourcesPath : '';
if (_res) {
  const _paths = [
    _nodePath.join(__dirname, 'node_modules'),
    _nodePath.join(_res, 'node_modules'),
    _nodePath.join(_res, 'app.asar', 'node_modules'),
    _nodePath.join(_res, 'app.asar.unpacked', 'node_modules')
  ].filter((p) => p);
  for (const p of _paths) {
    if (!module.paths.includes(p)) module.paths.push(p);
  }
}`

const result = await build({
  entryPoints: [contentEntry],
  outfile: outEntry,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external,
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  banner: { js: banner }
})

if (result.errors.length > 0) {
  console.error('[content] Build FAILED:', result.errors)
  process.exit(1)
}

// Copy renderer (including static assets: js, vendor, styles, fonts)
const rendererOutDir = join(outDir, 'renderer')
if (existsSync(rendererSource)) {
  mkdirSync(rendererOutDir, { recursive: true })
  cpSync(rendererSource, rendererOutDir, { recursive: true, force: true })
  console.log('[content] Renderer copied')
} else {
  console.warn('[content] WARNING: renderer not found at', rendererSource)
}

// Write manifest
const manifest = {
  name: 'pic-content',
  version,
  type: 'content',
  entry: 'app.js',
  renderer: 'renderer/index.html',
  requiresShell: '>=2.4.0',
  capabilities: {
    ipc: ['photos', 'albums', 'import', 'database', 'rename', 'tags', 'exif', 'delete', 'materialBrowser'],
    services: ['cache', 'changelog', 'window'],
    db: true
  },
  builtAt: new Date().toISOString()
}
writeFileSync(join(outDir, 'modules.json'), JSON.stringify(manifest, null, 2))
console.log('[content] modules.json written')

console.log(`[content] Done. Content staged at ${outDir}`)
