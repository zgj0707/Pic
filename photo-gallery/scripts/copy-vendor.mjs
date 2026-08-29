import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const vendorDir = join(root, 'public', 'vendor')
const fontsDir = join(vendorDir, 'fonts')

mkdirSync(vendorDir, { recursive: true })
mkdirSync(fontsDir, { recursive: true })

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const dstPath = join(dst, entry)
    const stat = statSync(srcPath)
    if (stat.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      copyFileSync(srcPath, dstPath)
    }
  }
}

// 1. Tailwind CSS
console.log('Generating Tailwind CSS...')
execSync(
  'npx tailwindcss -i ./public/styles/app.css -o ./public/vendor/tailwind.css --minify',
  { cwd: root, stdio: 'inherit' }
)

// 2. Fonts (fontsource)
console.log('Copying fonts...')
const fontPackages = [
  '@fontsource/dm-sans',
  '@fontsource/dm-serif-display'
]
for (const pkg of fontPackages) {
  const pkgDir = join(root, 'node_modules', pkg)
  copyFileSync(join(pkgDir, 'index.css'), join(fontsDir, `${pkg.replace('@fontsource/', '')}.css`))
  copyDir(join(pkgDir, 'files'), join(fontsDir, 'files'))
}

// 3. Font Awesome
console.log('Copying Font Awesome...')
const faDir = join(root, 'node_modules', '@fortawesome', 'fontawesome-free')
const faCss = readFileSync(join(faDir, 'css', 'all.min.css'), 'utf8')
writeFileSync(
  join(vendorDir, 'fontawesome.css'),
  faCss.replace(/\.\.\/webfonts\//g, './webfonts/')
)
copyDir(join(faDir, 'webfonts'), join(vendorDir, 'webfonts'))

console.log('Vendor files copied to public/vendor')
