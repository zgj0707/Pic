import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const tempDir = mkdtempSync(join(tmpdir(), 'pic-thumb-test-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => tempDir
  }
}))

const sharpMock = vi.fn((filePath: string) => ({
  resize: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toFile: vi.fn().mockImplementation(async (destPath: string) => {
    writeFileSync(destPath, Buffer.from(`thumb-${filePath}`))
  })
}))

vi.mock('sharp', () => ({
  default: sharpMock
}))

import { generateThumbnail, getThumbnailPath } from '../../electron/services/thumbnail'

describe('Thumbnail Service', () => {
  let imagePath: string

  beforeEach(() => {
    imagePath = join(tempDir, 'source.jpg')
    writeFileSync(imagePath, Buffer.from('fake-image'))
    sharpMock.mockClear()
  })

  afterEach(() => {
    // clean up generated webp files
    const files = readdirSync(tempDir)
    for (const file of files) {
      if (file.endsWith('.webp')) {
        rmSync(join(tempDir, file), { force: true })
      }
    }
  })

  describe('getThumbnailPath', () => {
    it('should return a deterministic webp path based on file path and mtime', () => {
      const path1 = getThumbnailPath(imagePath, 'grid')
      const path2 = getThumbnailPath(imagePath, 'grid')
      expect(path1).toBe(path2)
      expect(path1.endsWith('.webp')).toBe(true)
    })

    it('should return different paths for different sizes', () => {
      const gridPath = getThumbnailPath(imagePath, 'grid')
      const previewPath = getThumbnailPath(imagePath, 'preview')
      expect(gridPath).not.toBe(previewPath)
    })

    it('should fall back to original path when stat fails', () => {
      const path = getThumbnailPath(join(tempDir, 'nonexistent.jpg'), 'grid')
      expect(path).toBe(join(tempDir, 'nonexistent.jpg'))
    })
  })

  describe('generateThumbnail', () => {
    it('should return existing thumbnail without regenerating', async () => {
      const thumbPath = getThumbnailPath(imagePath, 'grid')
      writeFileSync(thumbPath, Buffer.from('existing-thumb'))

      const result = await generateThumbnail(imagePath, 'grid')

      expect(result).toBe(thumbPath)
      expect(sharpMock).not.toHaveBeenCalled()
    })

    it('should generate a new thumbnail when cache misses', async () => {
      const result = await generateThumbnail(imagePath, 'grid')

      expect(result.endsWith('.webp')).toBe(true)
      expect(existsSync(result)).toBe(true)
      expect(sharpMock).toHaveBeenCalledTimes(1)
    })

    it('should use grid config by default', async () => {
      await generateThumbnail(imagePath)

      const sharpInstance = sharpMock.mock.results[0].value
      expect(sharpInstance.resize).toHaveBeenCalledWith(320, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      expect(sharpInstance.webp).toHaveBeenCalledWith({ quality: 80 })
    })

    it('should use preview config when size is preview', async () => {
      await generateThumbnail(imagePath, 'preview')

      const sharpInstance = sharpMock.mock.results[0].value
      expect(sharpInstance.resize).toHaveBeenCalledWith(1200, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      expect(sharpInstance.webp).toHaveBeenCalledWith({ quality: 85 })
    })

    it('should regenerate thumbnail when source file mtime changes', async () => {
      const result1 = await generateThumbnail(imagePath, 'grid')

      // wait a bit to ensure different mtime
      await new Promise(resolve => setTimeout(resolve, 20))
      writeFileSync(imagePath, Buffer.from('modified-image'))

      const result2 = await generateThumbnail(imagePath, 'grid')

      expect(result1).not.toBe(result2)
      expect(sharpMock).toHaveBeenCalledTimes(2)
    })
  })
})
