import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { exportPhotosToPdf, sanitizePdfBaseName } from '../../electron/services/pdfExport'

describe('A4 reference PDF export', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('sanitizes PDF file names without changing the desktop folder sanitizer', () => {
    expect(sanitizePdfBaseName('  白发森系:参考/方案?  ')).toBe('白发森系-参考-方案-')
    expect(sanitizePdfBaseName('...')).toBe('Pic-样片')
  })

  it('exports one centered A4 page per valid image and preserves order', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-pdf-export-'))
    const desktop = join(tempDir, 'Desktop')
    const sourceDir = join(tempDir, 'sources')
    mkdirSync(desktop, { recursive: true })
    mkdirSync(sourceDir, { recursive: true })

    const sharp = await import('sharp')
    const first = join(sourceDir, 'first.jpg')
    const second = join(sourceDir, 'second.jpg')
    await sharp.default({ create: { width: 320, height: 480, channels: 3, background: '#335544' } }).jpeg().toFile(first)
    await sharp.default({ create: { width: 640, height: 360, channels: 3, background: '#445566' } }).jpeg().toFile(second)

    const result = await exportPhotosToPdf(
      [first, second, join(sourceDir, 'missing.jpg')],
      '白发森系:参考',
      desktop
    )

    expect(result.success).toBe(false)
    expect(result.exported).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.filePath).toBe(join(desktop, '白发森系-参考.pdf'))
    expect(readFileSync(result.filePath!, 'ascii').slice(0, 8)).toBe('%PDF-1.4')
    const pdfText = readFileSync(result.filePath!, 'latin1')
    expect((pdfText.match(/\/Type \/Page \/Parent/g) || []).length).toBe(2)
    expect((pdfText.match(/\/Subtype \/Image/g) || []).length).toBe(2)

    const secondResult = await exportPhotosToPdf([first], '白发森系:参考', desktop)
    expect(secondResult.filePath).toBe(join(desktop, '白发森系-参考-2.pdf'))
  })
})
