import { ipcMain } from 'electron'
import { ExifTool } from 'exiftool-vendored'
import { existsSync } from 'fs'
import { isWritableFormat, isRawFormat } from '../utils/fileSystem'
import { wrapAsyncHandler } from '../utils/ipcHandler'
import type { ExifData, ExifOperationResult, BatchExifResult } from '../types'

/**
 * Validate that a file exists and supports EXIF writing.
 * Returns an error string if validation fails, null on success.
 */
function validateWritableFile(filePath: string): string | null {
  if (!existsSync(filePath)) return '文件不存在'
  if (isRawFormat(filePath)) return 'RAW格式不支持写入'
  if (!isWritableFormat(filePath)) return '不支持的文件格式，仅支持 JPG/JPEG/PNG/TIFF'
  return null
}

// ─── ExifTool 单例 ───
// exiftool-vendored 设计为复用单例实例。每个操作 new/end 会反复启动/销毁
// Perl 子进程，照片多时开销巨大。改为模块级共享实例，应用退出时统一关闭。
let exiftoolSingleton: ExifTool | null = null

function getExifTool(): ExifTool {
  if (!exiftoolSingleton) {
    exiftoolSingleton = new ExifTool()
  }
  return exiftoolSingleton
}

/**
 * 关闭单例 ExifTool 实例（应用退出时调用）。
 */
export async function closeExifTool(): Promise<void> {
  if (exiftoolSingleton) {
    try { await exiftoolSingleton.end() } catch { /* ignore */ }
    exiftoolSingleton = null
  }
}

/**
 * Safely execute an ExifTool write operation using the shared singleton.
 * Returns a standard ExifOperationResult.
 */
async function executeExifWrite(
  fn: (exiftool: ExifTool) => Promise<void>
): Promise<ExifOperationResult> {
  try {
    await fn(getExifTool())
    return { success: true }
  } catch (error) {
    return { success: false, error: '写入EXIF失败: ' + String(error) }
  }
}

async function readExifData(filePath: string): Promise<ExifOperationResult & { data?: ExifData }> {
  if (!existsSync(filePath)) {
    return { success: false, error: '文件不存在' }
  }

  try {
    const result = await getExifTool().read(filePath)

    const exifData: ExifData = {}

    if (result.Rating !== undefined) {
      exifData.rating = Number(result.Rating)
    }

    if (result.Keywords) {
      let tags: string[] = []
      if (Array.isArray(result.Keywords)) {
        tags = result.Keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
      } else {
        tags = [String(result.Keywords).trim()].filter(Boolean)
      }
      exifData.tags = Array.from(new Set(tags)).sort()
    } else if (result.Subject) {
      const subjectTags = String(result.Subject).split(',').map(t => t.trim()).filter(Boolean)
      exifData.tags = Array.from(new Set(subjectTags)).sort()
    }

    if (result.Comment) {
      exifData.comment = String(result.Comment)
    }

    if (result.DateTimeOriginal) {
      exifData.dateTaken = String(result.DateTimeOriginal)
    }
    if (result.Model) {
      exifData.cameraModel = String(result.Model)
    }
    if (result.LensModel) {
      exifData.lensModel = String(result.LensModel)
    }
    if (result.ISO) {
      exifData.iso = Number(result.ISO)
    }
    if (result.Aperture) {
      exifData.aperture = Number(result.Aperture)
    }
    if (result.ShutterSpeed) {
      exifData.shutterSpeed = String(result.ShutterSpeed)
    }
    if (result.FocalLength) {
      exifData.focalLength = String(result.FocalLength)
    }

    return { success: true, data: exifData }
  } catch (error) {
    return { success: false, error: '读取EXIF失败: ' + String(error) }
  }
}

async function writeExifRating(filePath: string, rating: number): Promise<ExifOperationResult> {
  if (!existsSync(filePath)) return { success: false, error: '文件不存在' }
  if (rating < 0 || rating > 5) return { success: false, error: '评级必须在0-5之间' }
  const validationError = validateWritableFile(filePath)
  if (validationError) return { success: false, error: validationError }

  return await executeExifWrite(async (exiftool) => {
    await exiftool.write(filePath, {
      Rating: rating,
      RatingPercent: rating * 20
    }, ['-overwrite_original'])
  })
}

export async function writeExifTags(filePath: string, tags: string[]): Promise<ExifOperationResult> {
  if (!existsSync(filePath)) return { success: false, error: '文件不存在' }
  const validationError = validateWritableFile(filePath)
  if (validationError) return { success: false, error: validationError }

  // Deduplicate and sort tags
  const trimmedTags = tags.map(t => t.trim()).filter(t => t)
  const uniqueTags = Array.from(new Set(trimmedTags)).sort()

  return await executeExifWrite(async (exiftool) => {
    await exiftool.write(filePath, {
      Keywords: uniqueTags,
      Subject: uniqueTags.join(', ')
    }, ['-overwrite_original'])
  })
}

async function batchWriteExifTags(filePaths: string[], tags: string[]): Promise<BatchExifResult> {
  const results: { filePath: string; success: boolean; error?: string }[] = []

  for (const filePath of filePaths) {
    const result = await writeExifTags(filePath, tags)
    results.push({
      filePath,
      success: result.success,
      error: result.error
    })
  }

  return {
    success: results.every(r => r.success),
    results
  }
}

async function writeExifData(filePath: string, data: Partial<ExifData>): Promise<ExifOperationResult> {
  if (!existsSync(filePath)) return { success: false, error: '文件不存在' }
  const validationError = validateWritableFile(filePath)
  if (validationError) return { success: false, error: validationError }

  const exifData: Record<string, unknown> = {}

  if (data.rating !== undefined) {
    exifData.Rating = data.rating
    exifData.RatingPercent = data.rating * 20
  }

  if (data.tags && data.tags.length > 0) {
    exifData.Keywords = data.tags.filter(t => t.trim())
    exifData.Subject = data.tags.filter(t => t.trim()).join(', ')
  }

  if (data.subject) {
    exifData.Subject = data.subject
  }

  if (data.comment) {
    exifData.Comment = data.comment
  }

  return await executeExifWrite(async (exiftool) => {
    await exiftool.write(filePath, exifData, ['-overwrite_original'])
  })
}

export function registerExifToolIpc(): void {
  ipcMain.handle('exif:getExifData', wrapAsyncHandler('exif:getExifData',
    async (_event, filePath: string) => await readExifData(filePath)
  ))

  ipcMain.handle('exif:writeRating', wrapAsyncHandler('exif:writeRating',
    async (_event, filePath: string, rating: number) => await writeExifRating(filePath, rating)
  ))

  ipcMain.handle('exif:writeTags', wrapAsyncHandler('exif:writeTags',
    async (_event, filePath: string, tags: string[]) => await writeExifTags(filePath, tags)
  ))

  ipcMain.handle('exif:batchWriteTags', wrapAsyncHandler('exif:batchWriteTags',
    async (_event, filePaths: string[], tags: string[]) => await batchWriteExifTags(filePaths, tags)
  ))

  ipcMain.handle('exif:writeExifData', wrapAsyncHandler('exif:writeExifData',
    async (_event, filePath: string, data: Partial<ExifData>) => await writeExifData(filePath, data)
  ))

  ipcMain.handle('exif:getAllUsedTags', () => {
    return []
  })
}
