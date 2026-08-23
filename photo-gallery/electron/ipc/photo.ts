import { ipcMain, app } from 'electron'
import { join, basename, dirname } from 'path'
import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'fs'
import { dbAdapter, saveDatabase } from '../services/database'
import { getDownloadDir } from '../services/config'
import { syncTagsToPhotoExif } from '../utils/exifSync'
import { buildInPlaceholders } from '../utils/dbHelpers'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'
import type { PhotoFilter, PhotoQueryOptions, Photo, IpcResponse } from '../types'

const RECYCLE_BIN_DIR_NAME = '回收站'
const RECYCLE_BIN_RETENTION_DAYS = 30

function getRecycleBinDir(): string {
  return join(getDownloadDir(), RECYCLE_BIN_DIR_NAME)
}

function ensureRecycleBinDir(): void {
  const dir = getRecycleBinDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function getUniqueRecyclePath(filePath: string): string {
  const dir = getRecycleBinDir()
  const filename = basename(filePath)
  const timestamp = Date.now()
  return join(dir, `${timestamp}_${filename}`)
}

function buildPhotoFilterSql(filter: PhotoFilter): { whereClause: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.deletedOnly) {
    conditions.push('p.deleted_at IS NOT NULL')
  } else {
    conditions.push('p.deleted_at IS NULL')
  }

  if (filter.projectId !== undefined) {
    conditions.push('p.project_id = ?')
    params.push(filter.projectId)
  }

  if (filter.albumId) {
    conditions.push('EXISTS (SELECT 1 FROM photo_albums pa WHERE pa.photo_id = p.id AND pa.album_id = ?)')
    params.push(filter.albumId)
  }

  if (filter.rating !== undefined) {
    conditions.push('p.rating >= ?')
    params.push(filter.rating)
  }

  if (filter.isFavorite !== undefined) {
    conditions.push('p.is_favorite = ?')
    params.push(filter.isFavorite ? 1 : 0)
  }

  if (filter.search) {
    conditions.push('(p.filename LIKE ? OR p.filepath LIKE ? OR EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.photo_id = p.id AND t.name LIKE ?))')
    const like = `%${filter.search}%`
    params.push(like, like, like)
  }

  if (filter.dateFrom) {
    conditions.push('p.created_at >= ?')
    params.push(filter.dateFrom)
  }

  if (filter.dateTo) {
    conditions.push('p.created_at <= ?')
    params.push(filter.dateTo)
  }

  if (filter.tags && filter.tags.length > 0) {
    const placeholders = buildInPlaceholders(filter.tags.length)
    conditions.push(`EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.photo_id = p.id AND t.name IN (${placeholders}))`)
    params.push(...filter.tags)
  }

  if (filter.orientation) {
    if (filter.orientation === 'landscape') {
      conditions.push('p.width > p.height')
    } else if (filter.orientation === 'portrait') {
      conditions.push('p.height > p.width')
    } else if (filter.orientation === 'square') {
      conditions.push('p.width = p.height')
    }
  }

  if (filter.camera) {
    conditions.push('p.exif_json LIKE ?')
    params.push(`%"cameraModel":"${filter.camera}"%`)
  }

  if (filter.lens) {
    conditions.push('p.exif_json LIKE ?')
    params.push(`%"lensModel":"${filter.lens}"%`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { whereClause, params }
}

export function registerPhotoIpc(): void {
  ipcMain.handle('photos:count', wrapHandler('photos:count',
    (_event, filter?: PhotoFilter) => {
      const { whereClause, params } = buildPhotoFilterSql(filter || {})
      const result = dbAdapter.get(`SELECT COUNT(*) as total FROM photos p ${whereClause}`, params)
      return result?.total ?? 0
    }
  ))

  ipcMain.handle('photos:getAll', wrapHandler('photos:getAll',
    (_event, options?: PhotoQueryOptions) => {
      const filter = options?.filter || ({} as PhotoFilter)
      const { whereClause, params } = buildPhotoFilterSql(filter)
      const limitClause = options?.limit ? `LIMIT ${options.limit}` : ''
      const offsetClause = options?.offset ? `OFFSET ${options.offset}` : ''

      const sql = `SELECT p.* FROM photos p ${whereClause} ORDER BY p.imported_at DESC ${limitClause} ${offsetClause}`
      const photos = dbAdapter.query(sql, params) as Photo[]

      for (const photo of photos) {
        const tags = dbAdapter.query(`
          SELECT t.name FROM tags t
          JOIN photo_tags pt ON t.id = pt.tag_id
          WHERE pt.photo_id = ?
          ORDER BY t.name
        `, [photo.id])
        photo.tags = tags.map(t => t.name)
      }

      return photos
    }
  ))

  ipcMain.handle('photos:getById', wrapHandler('photos:getById',
    (_event, id: number) => {
      return dbAdapter.get('SELECT * FROM photos WHERE id = ?', [id])
    }
  ))

  ipcMain.handle('photos:updateRating', wrapHandler('photos:updateRating',
    (_event, id: number, rating: number) => {
      dbAdapter.run('UPDATE photos SET rating = ? WHERE id = ?', [rating, id])
      return { success: true }
    }
  ))

  ipcMain.handle('photos:toggleFavorite', wrapHandler('photos:toggleFavorite',
    (_event, id: number) => {
      dbAdapter.run('UPDATE photos SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?', [id])
      return { success: true }
    }
  ))

  ipcMain.handle('photos:updateTags', wrapAsyncHandler('photos:updateTags',
    async (_event, id: number, tags: string[]) => {
      dbAdapter.run('DELETE FROM photo_tags WHERE photo_id = ?', [id])

      for (const tag of tags) {
        dbAdapter.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tag])
        dbAdapter.run('INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, (SELECT id FROM tags WHERE name = ?))', [id, tag])
      }

      await syncTagsToPhotoExif(id)
      return { success: true }
    }
  ))

  ipcMain.handle('photos:delete', wrapAsyncHandler('photos:delete',
    async (_event, ids: number[]) => {
      const placeholders = buildInPlaceholders(ids.length)
      const photos = dbAdapter.query(`SELECT id, filepath FROM photos WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids)

      ensureRecycleBinDir()
      const now = Math.floor(Date.now() / 1000)

      for (const photo of photos) {
        if (!photo.filepath) continue
        try {
          const newPath = getUniqueRecyclePath(photo.filepath)
          renameSync(photo.filepath, newPath)
          dbAdapter.run('UPDATE photos SET deleted_at = ?, filepath = ? WHERE id = ?', [now, newPath, photo.id])
          console.log('[recycle] Moved to recycle bin:', newPath)
        } catch (error) {
          console.error('[recycle] Failed to move file:', photo.filepath, error)
        }
      }

      saveDatabase()
      return { success: true, moved: photos.length }
    }
  ))

  ipcMain.handle('photos:restore', wrapAsyncHandler('photos:restore',
    async (_event, ids: number[]) => {
      const placeholders = buildInPlaceholders(ids.length)
      const photos = dbAdapter.query(`SELECT id, filepath FROM photos WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`, ids)

      let restored = 0
      for (const photo of photos) {
        if (!photo.filepath) continue
        try {
          const recyclePath = photo.filepath
          const originalDir = dirname(recyclePath)
          // 尝试推断原始文件名：回收站路径格式为 {timestamp}_{filename}
          const recycleFilename = basename(recyclePath)
          const originalFilename = recycleFilename.replace(/^\d+_/, '')
          let targetPath = join(originalDir, originalFilename)

          // 如果原始目录现在就是回收站目录，说明原目录已被删除或变更，
          // 则恢复到样片库根目录
          if (originalDir === getRecycleBinDir()) {
            targetPath = join(getDownloadDir(), originalFilename)
          }

          if (!existsSync(dirname(targetPath))) {
            mkdirSync(dirname(targetPath), { recursive: true })
          }

          if (existsSync(targetPath)) {
            const extIndex = targetPath.lastIndexOf('.')
            const base = extIndex > 0 ? targetPath.slice(0, extIndex) : targetPath
            const ext = extIndex > 0 ? targetPath.slice(extIndex) : ''
            targetPath = `${base}_${Date.now()}${ext}`
          }

          renameSync(recyclePath, targetPath)
          dbAdapter.run('UPDATE photos SET deleted_at = NULL, filepath = ? WHERE id = ?', [targetPath, photo.id])
          restored++
          console.log('[recycle] Restored:', targetPath)
        } catch (error) {
          console.error('[recycle] Failed to restore photo:', photo.id, error)
        }
      }

      saveDatabase()
      return { success: true, restored }
    }
  ))

  ipcMain.handle('photos:deletePermanently', wrapAsyncHandler('photos:deletePermanently',
    async (_event, ids: number[]) => {
      const placeholders = buildInPlaceholders(ids.length)
      const photos = dbAdapter.query(`SELECT filepath FROM photos WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`, ids)

      for (const photo of photos) {
        if (!photo.filepath) continue
        try {
          if (existsSync(photo.filepath)) {
            rmSync(photo.filepath)
            console.log('[recycle] Permanently deleted:', photo.filepath)
          }
        } catch (error) {
          console.error('[recycle] Failed to delete file permanently:', photo.filepath, error)
        }
      }

      dbAdapter.run(`DELETE FROM photo_tags WHERE photo_id IN (${placeholders})`, ids)
      dbAdapter.run(`DELETE FROM photos WHERE id IN (${placeholders})`, ids)
      saveDatabase()
      return { success: true }
    }
  ))

  ipcMain.handle('photos:getDeleted', wrapHandler('photos:getDeleted',
    (_event, options?: PhotoQueryOptions) => {
      const filter = options?.filter || ({} as PhotoFilter)
      filter.deletedOnly = true
      const { whereClause, params } = buildPhotoFilterSql(filter)
      const limitClause = options?.limit ? `LIMIT ${options.limit}` : ''
      const offsetClause = options?.offset ? `OFFSET ${options.offset}` : ''

      const sql = `SELECT p.* FROM photos p ${whereClause} ORDER BY p.deleted_at DESC ${limitClause} ${offsetClause}`
      const photos = dbAdapter.query(sql, params) as Photo[]

      for (const photo of photos) {
        const tags = dbAdapter.query(`
          SELECT t.name FROM tags t
          JOIN photo_tags pt ON t.id = pt.tag_id
          WHERE pt.photo_id = ?
          ORDER BY t.name
        `, [photo.id])
        photo.tags = tags.map(t => t.name)
      }

      return photos
    }
  ))

  ipcMain.handle('photos:countDeleted', wrapHandler('photos:countDeleted',
    () => {
      const result = dbAdapter.get('SELECT COUNT(*) as total FROM photos WHERE deleted_at IS NOT NULL')
      return result?.total ?? 0
    }
  ))

  ipcMain.handle('photos:getTags', wrapHandler('photos:getTags',
    (_event, id: number) => {
      return dbAdapter.query(`
        SELECT t.* FROM tags t
        JOIN photo_tags pt ON t.id = pt.tag_id
        WHERE pt.photo_id = ?
      `, [id])
    }
  ))

  ipcMain.handle('photos:generateThumbnails', wrapAsyncHandler('photos:generateThumbnails',
    async (_event) => {
      const photos = dbAdapter.query('SELECT id, filepath, thumbnail_path FROM photos WHERE deleted_at IS NULL')
      let generated = 0

      for (const photo of photos) {
        if (photo.filepath) {
          try {
            const { generateThumbnail } = await import('../services/thumbnail')
            const thumbPath = await generateThumbnail(photo.filepath, 'grid')
            dbAdapter.run('UPDATE photos SET thumbnail_path = ? WHERE id = ?', [thumbPath, photo.id])
            generated++
          } catch {
            // thumbnail generation errors are non-fatal
          }
        }
      }

      saveDatabase()
      return { success: true, generated }
    }
  ))

  ipcMain.handle('photos:getThumbnail', wrapAsyncHandler('photos:getThumbnail',
    async (_event, id: number, size: import('../services/thumbnail').ThumbnailSize = 'grid') => {
      const photo = dbAdapter.get('SELECT filepath FROM photos WHERE id = ? AND deleted_at IS NULL', [id])
      if (!photo || !photo.filepath) {
        return { success: false, error: 'Photo not found' }
      }
      const { generateThumbnail } = await import('../services/thumbnail')
      const thumbPath = await generateThumbnail(photo.filepath, size)
      return { success: true, data: { path: thumbPath } }
    }
  ))

  // 自动清理超过保留期的回收站照片
  try {
    const cutoff = Math.floor(Date.now() / 1000) - RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60
    const expired = dbAdapter.query('SELECT id, filepath FROM photos WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff])
    if (expired.length > 0) {
      const expiredIds = expired.map((p) => p.id as number)
      const placeholders = buildInPlaceholders(expiredIds.length)
      for (const photo of expired) {
        try {
          if (photo.filepath && existsSync(photo.filepath)) {
            rmSync(photo.filepath)
          }
        } catch (error) {
          console.error('[recycle] Auto cleanup failed:', photo.filepath, error)
        }
      }
      dbAdapter.run(`DELETE FROM photo_tags WHERE photo_id IN (${placeholders})`, expiredIds)
      dbAdapter.run(`DELETE FROM photos WHERE id IN (${placeholders})`, expiredIds)
      console.log(`[recycle] Auto cleaned ${expired.length} expired photos`)
    }
  } catch (error) {
    console.error('[recycle] Auto cleanup error:', error)
  }

  ipcMain.handle('pdf:saveToDesktop', wrapAsyncHandler('pdf:saveToDesktop',
    async (_event, pdfData: string, filename: string): Promise<IpcResponse<{ path: string }>> => {
      const desktopPath = app.getPath('desktop')
      const filePath = join(desktopPath, filename)

      const buffer = Buffer.from(pdfData.split(',')[1], 'base64')
      writeFileSync(filePath, buffer)

      return { success: true, data: { path: filePath } }
    }
  ))
}
