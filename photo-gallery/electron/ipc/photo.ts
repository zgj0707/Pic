import { ipcMain, app } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, writeFileSync, renameSync, copyFileSync } from 'fs'
import { dbAdapter, saveDatabase } from '../services/database'
import { getCacheDir } from '../services/cacheManager'
import { getDownloadDir } from '../services/config'
import { syncTagsToPhotoExif } from '../utils/exifSync'
import { buildInPlaceholders } from '../utils/dbHelpers'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'
import type { PhotoFilter, PhotoQueryOptions, Photo, IpcResponse } from '../types'

function buildPhotoFilterSql(filter: PhotoFilter): { whereClause: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

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
      const photos = dbAdapter.query(`SELECT filepath FROM photos WHERE id IN (${placeholders})`, ids)
      const filePaths = photos.map(p => p.filepath).filter((fp: string) => fp)

      if (filePaths.length > 0) {
        const trashDir = join(getDownloadDir(), '回收站')
        if (!existsSync(trashDir)) {
          mkdirSync(trashDir, { recursive: true })
        }

        for (const filePath of filePaths) {
          try {
            const filename = basename(filePath)
            const timestamp = Date.now()
            const newPath = join(trashDir, `${timestamp}_${filename}`)
            renameSync(filePath, newPath)
            console.log('Moved file to trash:', newPath)
          } catch (error) {
            console.error('Failed to move file:', filePath, error)
          }
        }
      }

      dbAdapter.run(`DELETE FROM photo_tags WHERE photo_id IN (${placeholders})`, ids)
      dbAdapter.run(`DELETE FROM photos WHERE id IN (${placeholders})`, ids)
      return { success: true }
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
      const thumbDir = getCacheDir()

      const photos = dbAdapter.query('SELECT id, filepath, thumbnail_path FROM photos')
      let generated = 0

      for (const photo of photos) {
        if (!photo.thumbnail_path && photo.filepath) {
          try {
            const { generateThumbnail } = await import('../services/thumbnail')
            const thumbPath = await generateThumbnail(photo.filepath, photo.id, thumbDir, 300, 200)
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
