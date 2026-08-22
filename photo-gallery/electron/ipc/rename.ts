import { ipcMain, dialog } from 'electron'
import { statSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, extname, basename } from 'path'
import exifr from 'exifr'
import { isSupportedFile, scanDirectory, getUniqueFilePath } from '../utils/fileSystem'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'
import type { RenameOptions, RenameResult } from '../types'

function padNumber(num: number, length: number): string {
  return num.toString().padStart(length, '0')
}

function formatDate(date: Date, format: string): string {
  const yyyy = date.getFullYear().toString()
  const MM = padNumber(date.getMonth() + 1, 2)
  const dd = padNumber(date.getDate(), 2)
  const HH = padNumber(date.getHours(), 2)
  const mm = padNumber(date.getMinutes(), 2)
  const ss = padNumber(date.getSeconds(), 2)

  return format
    .replace('yyyy', yyyy)
    .replace('MM', MM)
    .replace('dd', dd)
    .replace('HH', HH)
    .replace('mm', mm)
    .replace('ss', ss)
}

async function generateNewName(
  filePath: string,
  index: number,
  options: RenameOptions
): Promise<{ newName: string; error?: string }> {
  try {
    const ext = extname(filePath).toLowerCase()
    const originalName = basename(filePath, ext)
    const stat = statSync(filePath)
    let date = new Date(stat.mtime)

    try {
      const exif = await exifr.parse(filePath, { exif: true })
      if (exif?.DateTimeOriginal) {
        date = new Date(exif.DateTimeOriginal)
      }
    } catch {
      // use file mtime as fallback
    }

    let newName = options.format

    newName = newName.replace(/{original}/g, originalName)
    newName = newName.replace(/{date}/g, formatDate(date, options.dateFormat))
    newName = newName.replace(/{time}/g, formatDate(date, 'HHmmss'))
    newName = newName.replace(/{seq}/g, padNumber(options.startIndex + index, 3))
    newName = newName.replace(/{prefix}/g, options.prefix)
    newName = newName.replace(/{suffix}/g, options.suffix)
    newName = newName.replace(/{ext}/g, ext.replace('.', ''))
    newName = newName.replace(/{year}/g, date.getFullYear().toString())
    newName = newName.replace(/{month}/g, padNumber(date.getMonth() + 1, 2))
    newName = newName.replace(/{day}/g, padNumber(date.getDate(), 2))

    // Clean up invalid filename characters
    newName = newName.replace(/[<>:"/\\|?*]/g, '_')

    return { newName: newName + ext }
  } catch (error) {
    return { newName: '', error: String(error) }
  }
}

/**
 * Collect all image files from a list of source paths.
 * Directories are scanned recursively; files are checked for supported extensions.
 */
function collectFiles(sourcePaths: string[]): string[] {
  const files: string[] = []
  for (const sourcePath of sourcePaths) {
    const stat = statSync(sourcePath)
    if (stat.isDirectory()) {
      files.push(...scanDirectory(sourcePath))
    } else if (stat.isFile() && isSupportedFile(sourcePath)) {
      files.push(sourcePath)
    }
  }
  return files
}

export function registerRenameIpc(): void {
  ipcMain.handle('rename:batch', wrapAsyncHandler('rename:batch',
    async (_event, options: RenameOptions): Promise<RenameResult> => {
      const results: { source: string; target: string; success: boolean; error?: string }[] = []

      if (!existsSync(options.outputDir)) {
        mkdirSync(options.outputDir, { recursive: true })
      }

      const files = collectFiles(options.sourcePaths)

      let index = 0
      for (const filePath of files) {
        const { newName, error } = await generateNewName(filePath, index, options)
        if (error) {
          results.push({ source: filePath, target: '', success: false, error })
          index++
          continue
        }

        const targetPath = getUniqueFilePath(join(options.outputDir, newName))

        try {
          copyFileSync(filePath, targetPath)
          results.push({ source: filePath, target: targetPath, success: true })
        } catch (copyError) {
          results.push({ source: filePath, target: targetPath, success: false, error: String(copyError) })
        }

        index++
      }

      return { success: true, results }
    }
  ))

  ipcMain.handle('rename:preview', wrapAsyncHandler('rename:preview',
    async (_event, options: RenameOptions) => {
      const previews: { source: string; newName: string; error?: string }[] = []
      let index = 0

      const files = collectFiles(options.sourcePaths)

      for (const filePath of files) {
        const { newName, error } = await generateNewName(filePath, index, options)
        previews.push({ source: filePath, newName, error })
        index++
      }

      return { success: true, previews }
    }
  ))

  ipcMain.handle('rename:selectOutputDir', wrapAsyncHandler('rename:selectOutputDir',
    async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择输出文件夹'
      })
      return result.filePaths[0] || null
    }
  ))
}
