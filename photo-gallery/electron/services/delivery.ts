import { extname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { dbAdapter } from './database'

export interface DeliveryItemResult {
  photoId: number
  filename: string
  targetPath: string
  success: boolean
  error?: string
}

export interface DeliveryExportResult {
  success: boolean
  folderPath?: string
  copied: number
  failed: number
  results: DeliveryItemResult[]
  error?: string
}

function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/[. ]+$/g, '')
  return cleaned || fallback
}

function getExtension(filename: string, filepath: string): string {
  const extension = extname(filename || filepath)
  return extension && extension.length <= 12 ? extension : '.jpg'
}

export function exportProjectDelivery(
  projectId: number,
  photoIds: number[],
  targetDir: string,
  folderName: string,
  prefix: string
): DeliveryExportResult {
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return { success: false, copied: 0, failed: 0, results: [], error: '灵感板为空' }
  }
  if (!targetDir || !existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    return { success: false, copied: 0, failed: photoIds.length, results: [], error: '目标目录不存在' }
  }

  const safeFolderName = sanitizeSegment(folderName, 'Pic-方案')
  const safePrefix = sanitizeSegment(prefix, 'PIC-')
  const folderPath = join(targetDir, safeFolderName)
  mkdirSync(folderPath, { recursive: true })
  const rows = dbAdapter.query(
    'SELECT * FROM photos WHERE project_id = ? AND id IN (' + photoIds.map(() => '?').join(', ') + ')',
    [projectId, ...photoIds]
  )
  const byId = new Map(rows.map(row => [Number(row.id), row]))
  const results: DeliveryItemResult[] = []
  let copiedCount = 0

  photoIds.forEach((photoId, index) => {
    const photo = byId.get(Number(photoId))
    const filename = photo?.filename ? String(photo.filename) : `样片-${photoId}`
    const filepath = photo?.filepath ? String(photo.filepath) : ''
    const targetPath = join(folderPath, `${safePrefix}${String(index + 1).padStart(3, '0')}${getExtension(filename, filepath)}`)
    if (!photo) {
      results.push({ photoId, filename, targetPath, success: false, error: '样片不属于当前项目或已不存在' })
      return
    }
    if (photo.deleted_at) {
      results.push({ photoId, filename, targetPath, success: false, error: '样片位于回收站' })
      return
    }
    if (!filepath || !existsSync(filepath)) {
      results.push({ photoId, filename, targetPath, success: false, error: '原图文件不存在' })
      return
    }
    if (existsSync(targetPath)) {
      results.push({ photoId, filename, targetPath, success: false, error: '目标文件已存在，未覆盖' })
      return
    }
    try {
      copyFileSync(filepath, targetPath)
      copiedCount += 1
      results.push({ photoId, filename, targetPath, success: true })
    } catch (error) {
      results.push({ photoId, filename, targetPath, success: false, error: error instanceof Error ? error.message : '复制失败' })
    }
  })

  const failed = results.filter(result => !result.success).length
  return {
    success: failed === 0,
    folderPath,
    copied: copiedCount,
    failed,
    results,
    error: failed > 0 ? String(failed) + ' 个参考样片未能加入方案' : undefined
  }
}
