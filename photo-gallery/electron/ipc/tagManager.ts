import { ipcMain } from 'electron'
import { dbAdapter } from '../services/database'
import { syncTagsToPhotoExif } from '../utils/exifSync'
import { recordToTag, recordsToTags } from '../utils/dbHelpers'
import { wrapHandler } from '../utils/ipcHandler'
import type { Tag, IpcResponse } from '../types'

function getAllTags(): Tag[] {
  const result = dbAdapter.query('SELECT * FROM tags ORDER BY name')
  return recordsToTags(result)
}

function createTag(name: string, color: string = '#0078d4'): Tag | null {
  const existing = dbAdapter.get('SELECT * FROM tags WHERE name = ? LIMIT 1', [name])
  if (existing) {
    return recordToTag(existing)
  }

  dbAdapter.run('INSERT INTO tags (name, color) VALUES (?, ?)', [name, color])

  const result = dbAdapter.get('SELECT * FROM tags WHERE name = ? LIMIT 1', [name])
  if (!result) return null
  return recordToTag(result)
}

function deleteTag(id: number): boolean {
  dbAdapter.run('DELETE FROM photo_tags WHERE tag_id = ?', [id])
  dbAdapter.run('DELETE FROM tags WHERE id = ?', [id])
  return true
}

function getTagsByPhoto(photoId: number): Tag[] {
  const result = dbAdapter.query(`
    SELECT t.* FROM tags t
    INNER JOIN photo_tags pt ON t.id = pt.tag_id
    WHERE pt.photo_id = ?
    ORDER BY t.name
  `, [photoId])
  return recordsToTags(result)
}

function getAllTagsWithCounts(): { tag: Tag; count: number }[] {
  const result = dbAdapter.query(`
    SELECT t.*, COUNT(pt.photo_id) as count
    FROM tags t
    LEFT JOIN photo_tags pt ON t.id = pt.tag_id
    GROUP BY t.id
    ORDER BY count DESC, t.name
  `)
  return result.map((row: Record<string, unknown>) => ({
    tag: recordToTag(row),
    count: row.count as number
  }))
}

export function addTagToPhoto(photoId: number, tagName: string): IpcResponse<Tag> {
  const rawTag = dbAdapter.get('SELECT * FROM tags WHERE name = ? LIMIT 1', [tagName])
  let tag: Tag

  if (!rawTag) {
    const newTag = createTag(tagName)
    if (!newTag) return { success: false, error: 'Failed to create tag' }
    tag = newTag
  } else {
    tag = recordToTag(rawTag)
  }

  const existing = dbAdapter.get(
    'SELECT * FROM photo_tags WHERE photo_id = ? AND tag_id = ? LIMIT 1',
    [photoId, tag.id]
  )

  if (!existing) {
    dbAdapter.run('INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, ?)', [photoId, tag.id])
  }

  // Fire-and-forget EXIF sync
  syncTagsToPhotoExif(photoId)

  return { success: true, data: tag }
}

function removeTagFromPhoto(photoId: number, tagId: number): boolean {
  dbAdapter.run('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?', [photoId, tagId])
  syncTagsToPhotoExif(photoId)
  return true
}

export function registerTagManagerIpc(): void {
  ipcMain.handle('tags:getAll', wrapHandler('tags:getAll', () => getAllTags()))
  ipcMain.handle('tags:create', wrapHandler('tags:create', (_event, name: string, color?: string) => createTag(name, color)))
  ipcMain.handle('tags:delete', wrapHandler('tags:delete', (_event, id: number) => deleteTag(id)))
  ipcMain.handle('tags:getByPhoto', wrapHandler('tags:getByPhoto', (_event, photoId: number) => getTagsByPhoto(photoId)))
  ipcMain.handle('tags:addToPhoto', wrapHandler('tags:addToPhoto', (_event, photoId: number, tagName: string) => addTagToPhoto(photoId, tagName)))
  ipcMain.handle('tags:removeFromPhoto', wrapHandler('tags:removeFromPhoto', (_event, photoId: number, tagId: number) => removeTagFromPhoto(photoId, tagId)))
  ipcMain.handle('tags:getAllWithCounts', wrapHandler('tags:getAllWithCounts', () => getAllTagsWithCounts()))
}
