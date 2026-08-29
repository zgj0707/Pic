import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const contentSource = readFileSync(join(root, 'electron', 'content', 'index.ts'), 'utf8')
const changelog = JSON.parse(readFileSync(join(root, 'electron', 'changelog.json'), 'utf8'))

describe('release version consistency', () => {
  it('publishes Pic 4.2.0 everywhere the release version is declared', () => {
    expect(packageJson.version).toBe('4.2.0')
    expect(packageLock.version).toBe(packageJson.version)
    expect(packageLock.packages[''].version).toBe(packageJson.version)
    expect(contentSource).toContain(`export const version = '${packageJson.version}'`)
    expect(changelog[0].version).toBe(packageJson.version)
  })

  it('keeps the portable artifact versioned by the package manifest', () => {
    expect(packageJson.build.win.artifactName).toContain('${version}')
    expect(packageJson.build.portable.artifactName).toContain('${version}')
  })
})
