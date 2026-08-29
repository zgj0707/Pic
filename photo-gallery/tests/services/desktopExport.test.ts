import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { copyPhotosToDesktopFolder, sanitizeDesktopFolderName } from '../../electron/services/desktopExport'

describe('desktop sample export', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('sanitizes the project folder name', () => {
    expect(sanitizeDesktopFolderName('  人像:周末/参考?  ')).toBe('人像-周末-参考-')
    expect(sanitizeDesktopFolderName('...')).toBe('Pic-样片')
  })

  it('copies selected originals and preserves same-name files without overwriting', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-desktop-export-'))
    const sourceA = join(tempDir, 'a', 'reference.jpg')
    const sourceB = join(tempDir, 'b', 'reference.jpg')
    const desktop = join(tempDir, 'Desktop')
    mkdirSync(join(tempDir, 'a'), { recursive: true })
    mkdirSync(join(tempDir, 'b'), { recursive: true })
    mkdirSync(desktop, { recursive: true })
    writeFileSync(sourceA, 'first')
    writeFileSync(sourceB, 'second')

    const result = copyPhotosToDesktopFolder([sourceA, sourceB], '拍摄/参考', desktop)

    expect(result.success).toBe(true)
    expect(result.copied).toBe(2)
    expect(result.failed).toBe(0)
    expect(readFileSync(join(desktop, '拍摄-参考', 'reference.jpg'), 'utf8')).toBe('first')
    expect(readFileSync(join(desktop, '拍摄-参考', 'reference-2.jpg'), 'utf8')).toBe('second')
  })

  it('reports missing originals without claiming full success', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-desktop-export-'))
    const desktop = join(tempDir, 'Desktop')
    mkdirSync(desktop, { recursive: true })

    const result = copyPhotosToDesktopFolder([join(tempDir, 'missing.jpg')], '参考', desktop)

    expect(result.success).toBe(false)
    expect(result.copied).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.results[0].error).toBe('原图文件不存在')
  })
})