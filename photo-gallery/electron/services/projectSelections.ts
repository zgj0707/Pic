import { dbAdapter, saveDatabase } from './database'
import type { Photo, ProjectSelection } from '../types'

function getTags(photoId: number): string[] {
  return dbAdapter
    .query(`
      SELECT t.name FROM tags t
      JOIN photo_tags pt ON pt.tag_id = t.id
      WHERE pt.photo_id = ?
      ORDER BY t.name
    `, [photoId])
    .map(row => String(row.name))
}

function mapSelectionRow(row: Record<string, unknown>): ProjectSelection {
  const {
    selection_id,
    selection_project_id,
    selection_photo_id,
    selection_position,
    selection_created_at,
    ...photoRow
  } = row
  const photo = { ...photoRow, tags: getTags(Number(selection_photo_id)) } as Photo
  return {
    id: Number(selection_id),
    project_id: Number(selection_project_id),
    photo_id: Number(selection_photo_id),
    position: Number(selection_position),
    created_at: Number(selection_created_at),
    photo
  }
}

export function listProjectSelections(projectId: number): ProjectSelection[] {
  const rows = dbAdapter.query(`
    SELECT
      s.id AS selection_id,
      s.project_id AS selection_project_id,
      s.photo_id AS selection_photo_id,
      s.position AS selection_position,
      s.created_at AS selection_created_at,
      p.*
    FROM project_selections s
    JOIN photos p ON p.id = s.photo_id
    WHERE s.project_id = ?
    ORDER BY s.position ASC, s.id ASC
  `, [projectId])
  return rows.map(mapSelectionRow)
}

function assertPhotoBelongsToProject(projectId: number, photoId: number): void {
  const photo = dbAdapter.get('SELECT id, project_id FROM photos WHERE id = ?', [photoId])
  if (!photo) throw new Error('照片不存在')
  if (Number(photo.project_id) !== projectId) throw new Error('照片不属于当前项目')
}

export function addProjectSelection(projectId: number, photoId: number): ProjectSelection {
  assertPhotoBelongsToProject(projectId, photoId)
  const existing = listProjectSelections(projectId).find(selection => selection.photo_id === photoId)
  if (existing) return existing

  const nextPosition = dbAdapter.get(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM project_selections WHERE project_id = ?',
    [projectId]
  )?.next_position ?? 0
  dbAdapter.insert('project_selections', {
    project_id: projectId,
    photo_id: photoId,
    position: Number(nextPosition),
    created_at: Math.floor(Date.now() / 1000)
  })
  saveDatabase()
  const added = listProjectSelections(projectId).find(selection => selection.photo_id === photoId)
  if (!added) throw new Error('精选照片写入失败')
  return added
}

export function removeProjectSelection(projectId: number, photoId: number): boolean {
  const result = dbAdapter.run(
    'DELETE FROM project_selections WHERE project_id = ? AND photo_id = ?',
    [projectId, photoId]
  )
  if (result.changes > 0) saveDatabase()
  return result.changes > 0
}

export function reorderProjectSelections(projectId: number, photoIds: number[]): ProjectSelection[] {
  const current = listProjectSelections(projectId)
  const currentIds = current.map(selection => selection.photo_id)
  const nextIds = photoIds.map(Number)
  if (new Set(nextIds).size !== nextIds.length || nextIds.length !== currentIds.length) {
    throw new Error('精选顺序与当前精选篮不一致')
  }
  const allowed = new Set(currentIds)
  if (nextIds.some(photoId => !allowed.has(photoId))) throw new Error('包含不属于当前精选篮的照片')

  nextIds.forEach((photoId, position) => {
    dbAdapter.run(
      'UPDATE project_selections SET position = ? WHERE project_id = ? AND photo_id = ?',
      [position, projectId, photoId]
    )
  })
  saveDatabase()
  return listProjectSelections(projectId)
}

export function removeSelectionsForPhotos(photoIds: number[]): void {
  if (photoIds.length === 0) return
  const placeholders = photoIds.map(() => '?').join(', ')
  dbAdapter.run(`DELETE FROM project_selections WHERE photo_id IN (${placeholders})`, photoIds)
}

export function moveProjectSelections(fromProjectId: number, toProjectId: number): void {
  const selections = dbAdapter.query(
    'SELECT photo_id, position FROM project_selections WHERE project_id = ? ORDER BY position, id',
    [fromProjectId]
  )
  for (const selection of selections) {
    const duplicate = dbAdapter.get(
      'SELECT id FROM project_selections WHERE project_id = ? AND photo_id = ?',
      [toProjectId, selection.photo_id]
    )
    if (duplicate) {
      dbAdapter.run('DELETE FROM project_selections WHERE id = ?', [selection.id])
    } else {
      dbAdapter.run(
        'UPDATE project_selections SET project_id = ? WHERE id = ?',
        [toProjectId, selection.id]
      )
    }
  }
}