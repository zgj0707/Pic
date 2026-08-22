import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  SUPPORTED_EXTENSIONS,
  isSupportedFile,
  isWritableFormat,
  isRawFormat,
  scanDirectory,
  getUniqueFilePath,
  getValidFileStat
} from '../../electron/utils/fileSystem'

describe('isSupportedFile', () => {
  it('should return true for .jpg files', () => {
    expect(isSupportedFile('photo.jpg')).toBe(true)
    expect(isSupportedFile('photo.JPG')).toBe(true)
  })

  it('should return true for .jpeg files', () => {
    expect(isSupportedFile('photo.jpeg')).toBe(true)
  })

  it('should return true for .png files', () => {
    expect(isSupportedFile('photo.png')).toBe(true)
  })

  it('should return true for .webp files', () => {
    expect(isSupportedFile('photo.webp')).toBe(true)
  })

  it('should return true for .heic files', () => {
    expect(isSupportedFile('photo.heic')).toBe(true)
  })

  it('should return true for .bmp files', () => {
    expect(isSupportedFile('photo.bmp')).toBe(true)
  })

  it('should return false for .gif files', () => {
    expect(isSupportedFile('animation.gif')).toBe(false)
  })

  it('should return false for .mp4 files', () => {
    expect(isSupportedFile('video.mp4')).toBe(false)
  })

  it('should return false for files without extension', () => {
    expect(isSupportedFile('README')).toBe(false)
  })

  it('should be case insensitive', () => {
    expect(isSupportedFile('photo.JPEG')).toBe(true)
    expect(isSupportedFile('photo.PNG')).toBe(true)
    expect(isSupportedFile('photo.WEBP')).toBe(true)
    expect(isSupportedFile('photo.TIFF')).toBe(true)
  })
})

describe('isWritableFormat', () => {
  it('should return true for JPEG variants', () => {
    expect(isWritableFormat('photo.jpg')).toBe(true)
    expect(isWritableFormat('photo.jpeg')).toBe(true)
  })

  it('should return true for PNG and TIFF', () => {
    expect(isWritableFormat('photo.png')).toBe(true)
    expect(isWritableFormat('photo.tiff')).toBe(true)
    expect(isWritableFormat('photo.tif')).toBe(true)
  })

  it('should return false for WEBP (not in writable list)', () => {
    expect(isWritableFormat('photo.webp')).toBe(false)
  })

  it('should return false for HEIC (not in writable list)', () => {
    expect(isWritableFormat('photo.heic')).toBe(false)
  })
})

describe('isRawFormat', () => {
  it('should return true for CR2 files', () => {
    expect(isRawFormat('photo.cr2')).toBe(true)
  })

  it('should return true for NEF files', () => {
    expect(isRawFormat('photo.nef')).toBe(true)
  })

  it('should return true for DNG files', () => {
    expect(isRawFormat('photo.dng')).toBe(true)
  })

  it('should return false for JPEG files', () => {
    expect(isRawFormat('photo.jpg')).toBe(false)
  })
})

describe('SUPPORTED_EXTENSIONS', () => {
  it('should include all expected extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('.jpg')
    expect(SUPPORTED_EXTENSIONS).toContain('.jpeg')
    expect(SUPPORTED_EXTENSIONS).toContain('.png')
    expect(SUPPORTED_EXTENSIONS).toContain('.webp')
    expect(SUPPORTED_EXTENSIONS).toContain('.bmp')
    expect(SUPPORTED_EXTENSIONS).toContain('.heic')
    expect(SUPPORTED_EXTENSIONS).toContain('.tiff')
  })
})

describe('scanDirectory', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-test-'))
    // Create test files
    writeFileSync(join(tempDir, 'photo1.jpg'), 'fake')
    writeFileSync(join(tempDir, 'photo2.png'), 'fake')
    writeFileSync(join(tempDir, 'readme.txt'), 'ignore')
    // Create subdirectory with files
    mkdirSync(join(tempDir, 'subdir'))
    writeFileSync(join(tempDir, 'subdir', 'photo3.webp'), 'fake')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should scan recursively and find all supported files', () => {
    const results = scanDirectory(tempDir, true)
    expect(results).toHaveLength(3)
    expect(results.some(f => f.endsWith('photo1.jpg'))).toBe(true)
    expect(results.some(f => f.endsWith('photo2.png'))).toBe(true)
    expect(results.some(f => f.endsWith('photo3.webp'))).toBe(true)
  })

  it('should not recurse when recursive=false', () => {
    const results = scanDirectory(tempDir, false)
    expect(results).toHaveLength(2)
    expect(results.some(f => f.endsWith('photo1.jpg'))).toBe(true)
    expect(results.some(f => f.endsWith('photo2.png'))).toBe(true)
    expect(results.some(f => f.endsWith('photo3.webp'))).toBe(false)
  })

  it('should skip non-image files', () => {
    const results = scanDirectory(tempDir, true)
    expect(results.some(f => f.endsWith('readme.txt'))).toBe(false)
  })

  it('should return empty array for non-existent directory', () => {
    const results = scanDirectory(join(tempDir, 'nonexistent'))
    expect(results).toEqual([])
  })
})

describe('getUniqueFilePath', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-unique-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should return original path if file does not exist', () => {
    const filePath = join(tempDir, 'newfile.jpg')
    expect(getUniqueFilePath(filePath)).toBe(filePath)
  })

  it('should append _1 when file exists', () => {
    const filePath = join(tempDir, 'photo.jpg')
    writeFileSync(filePath, 'data')
    const result = getUniqueFilePath(filePath)
    expect(result).toBe(join(tempDir, 'photo_1.jpg'))
  })

  it('should increment counter for multiple existing files', () => {
    const filePath = join(tempDir, 'photo.jpg')
    writeFileSync(filePath, 'data')
    writeFileSync(join(tempDir, 'photo_1.jpg'), 'data')
    writeFileSync(join(tempDir, 'photo_2.jpg'), 'data')
    const result = getUniqueFilePath(filePath)
    expect(result).toBe(join(tempDir, 'photo_3.jpg'))
  })
})

describe('getValidFileStat', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-stat-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should return stat info for a valid file', () => {
    const filePath = join(tempDir, 'test.jpg')
    writeFileSync(filePath, 'test content')
    const result = getValidFileStat(filePath)
    expect(result).not.toBeNull()
    expect(result!.size).toBe(12) // 'test content'.length
    expect(result!.mtime).toBeInstanceOf(Date)
  })

  it('should return null for non-existent file', () => {
    const result = getValidFileStat(join(tempDir, 'nope.jpg'))
    expect(result).toBeNull()
  })

  it('should return null for empty file (size 0)', () => {
    const filePath = join(tempDir, 'empty.jpg')
    writeFileSync(filePath, '')
    const result = getValidFileStat(filePath)
    expect(result).toBeNull()
  })
})
