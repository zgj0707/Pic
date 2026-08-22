/**
 * Shared file system utilities.
 * Eliminates duplicate isSupportedFile, scanDirectory, and getUniqueFilePath
 * implementations that were previously scattered across import.ts, rename.ts,
 * and materialBrowser.ts.
 */

import { readdirSync, existsSync, statSync } from 'fs'
import { join, extname, basename, dirname } from 'path'

/**
 * Supported image file extensions.
 * Consolidated from import.ts and rename.ts — includes all formats
 * the application can import, browse, or rename.
 */
export const SUPPORTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp',
  '.heif', '.heic', '.tiff', '.tif', '.bmp'
] as const

/**
 * Extensions that support EXIF writing via ExifTool.
 */
export const WRITABLE_EXIF_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif'] as const

/**
 * RAW format extensions (read-only, no EXIF write support).
 */
export const RAW_EXTENSIONS = ['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raw'] as const

/**
 * Check if a file path has a supported image extension.
 */
export function isSupportedFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * Check if a file supports EXIF writing.
 */
export function isWritableFormat(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return (WRITABLE_EXIF_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * Check if a file is a RAW format.
 */
export function isRawFormat(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return (RAW_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * Recursively scan a directory for supported image files.
 *
 * @param dirPath - Root directory to scan
 * @param recursive - If true (default), descends into subdirectories
 * @returns Array of absolute file paths
 */
export function scanDirectory(dirPath: string, recursive: boolean = true): string[] {
  const results: string[] = []
  if (!existsSync(dirPath)) return results

  const entries = readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory() && recursive) {
      results.push(...scanDirectory(fullPath, recursive))
    } else if (entry.isFile() && isSupportedFile(fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Generate a unique file path by appending _1, _2, etc. if the file exists.
 * Used by materialBrowser (download save) and rename (duplicate name handling).
 */
export function getUniqueFilePath(filePath: string): string {
  if (!existsSync(filePath)) return filePath

  const dir = dirname(filePath)
  const ext = extname(filePath)
  const name = basename(filePath, ext)
  let counter = 1
  let newPath = join(dir, `${name}_${counter}${ext}`)

  while (existsSync(newPath)) {
    counter++
    newPath = join(dir, `${name}_${counter}${ext}`)
  }
  return newPath
}

/**
 * Check if a file exists and has non-zero size.
 * Returns null if the file is invalid, or the stat object if valid.
 */
export function getValidFileStat(filePath: string): { mtime: Date; size: number } | null {
  try {
    const stat = statSync(filePath)
    if (!stat || stat.size === 0) return null
    return { mtime: stat.mtime, size: stat.size }
  } catch {
    return null
  }
}

/**
 * 读取图片的实际像素尺寸。
 * 优先使用 sharp，失败则返回 null。
 */
export async function getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = await import('sharp')
    const metadata = await sharp.default(filePath).metadata()
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height }
    }
    return null
  } catch {
    return null
  }
}
