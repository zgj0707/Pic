import { ipcMain } from 'electron'
import { dbAdapter } from '../services/database'
import { wrapHandler } from '../utils/ipcHandler'

export function registerAlbumIpc(): void {
  ipcMain.handle('albums:getAll', wrapHandler('albums:getAll', () => {
    return dbAdapter.query(`
      SELECT a.*, COUNT(pa.photo_id) as photo_count
      FROM albums a
      LEFT JOIN photo_albums pa ON a.id = pa.album_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `)
  }))

  ipcMain.handle('albums:create', wrapHandler('albums:create', (_event, name: string, parentId?: number) => {
    const result = dbAdapter.run('INSERT INTO albums (name, parent_id) VALUES (?, ?)', [name, parentId || null])
    return { id: result.lastInsertRowid, name, parent_id: parentId || null }
  }))

  ipcMain.handle('albums:rename', wrapHandler('albums:rename', (_event, id: number, name: string) => {
    dbAdapter.run('UPDATE albums SET name = ? WHERE id = ?', [name, id])
    return { success: true }
  }))

  ipcMain.handle('albums:delete', wrapHandler('albums:delete', (_event, id: number) => {
    dbAdapter.run('DELETE FROM albums WHERE id = ?', [id])
    return { success: true }
  }))

  ipcMain.handle('albums:addPhotos', wrapHandler('albums:addPhotos', (_event, albumId: number, photoIds: number[]) => {
    for (const photoId of photoIds) {
      dbAdapter.run('INSERT OR IGNORE INTO photo_albums (album_id, photo_id) VALUES (?, ?)', [albumId, photoId])
    }
    return { success: true }
  }))

  ipcMain.handle('albums:removePhotos', wrapHandler('albums:removePhotos', (_event, albumId: number, photoIds: number[]) => {
    for (const photoId of photoIds) {
      dbAdapter.run('DELETE FROM photo_albums WHERE album_id = ? AND photo_id = ?', [albumId, photoId])
    }
    return { success: true }
  }))
}
