import { constants, copyFileSync, existsSync, mkdirSync } from 'fs'
import { basename, extname, join } from 'path'

export interface DesktopCopyItem {
  sourcePath: string
  targetPath?: string
  success: boolean
  error?: string
}

export interface DesktopCopyResult {
  success: boolean
  folderPath?: string
  copied: number
  failed: number
  results: DesktopCopyItem[]
  error?: string
}

export function sanitizeDesktopFolderName(value: string): string {
  const withoutControls = Array.from(String(value || ''))
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
  const cleaned = withoutControls
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return cleaned || 'Pic-样片'
}

function availableTargetPath(folderPath: string, sourcePath: string): string {
  const sourceName = basename(sourcePath)
  const extension = extname(sourceName)
  const stem = basename(sourceName, extension)
  let targetPath = join(folderPath, sourceName)
  let suffix = 2
  while (existsSync(targetPath)) {
    targetPath = join(folderPath, stem + '-' + suffix + extension)
    suffix += 1
  }
  return targetPath
}

export function copyPhotosToDesktopFolder(
  filePaths: string[],
  requestedFolderName: string,
  desktopPath: string
): DesktopCopyResult {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { success: false, copied: 0, failed: 0, results: [], error: '没有可复制的样片' }
  }

  const folderPath = join(desktopPath, sanitizeDesktopFolderName(requestedFolderName))
  mkdirSync(folderPath, { recursive: true })
  const results: DesktopCopyItem[] = []
  let copied = 0

  for (const sourcePath of filePaths) {
    if (!sourcePath || !existsSync(sourcePath)) {
      results.push({ sourcePath, success: false, error: '原图文件不存在' })
      continue
    }
    const targetPath = availableTargetPath(folderPath, sourcePath)
    try {
      copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL)
      copied += 1
      results.push({ sourcePath, targetPath, success: true })
    } catch (error) {
      results.push({
        sourcePath,
        targetPath,
        success: false,
        error: error instanceof Error ? error.message : '复制失败'
      })
    }
  }

  const failed = results.length - copied
  return {
    success: copied > 0 && failed === 0,
    folderPath,
    copied,
    failed,
    results,
    error: failed > 0 ? failed + ' 张样片复制失败' : undefined
  }
}