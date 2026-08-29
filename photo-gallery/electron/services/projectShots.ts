import { dbAdapter, saveDatabase } from './database'
import type { Photo, ProjectShot } from '../types'

const SHOT_STATUSES = ['planned', 'ready', 'done'] as const

type ShotStatus = typeof SHOT_STATUSES[number]

export interface ProjectShotInput {
  chapter?: string
  title?: string
  intent?: string | null
  compositionNotes?: string | null
  lightingGearNotes?: string | null
  status?: ShotStatus
}

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

function mapShotRow(row: Record<string, unknown>): ProjectShot {
  const {
    shot_id,
    shot_project_id,
    shot_photo_id,
    shot_position,
    shot_chapter,
    shot_title,
    shot_intent,
    shot_composition_notes,
    shot_lighting_gear_notes,
    shot_status,
    shot_created_at,
    shot_updated_at,
    ...photoRow
  } = row
  const photoId = Number(shot_photo_id)
  const photo = { ...photoRow, tags: getTags(photoId) } as Photo
  return {
    id: Number(shot_id),
    project_id: Number(shot_project_id),
    photo_id: photoId,
    position: Number(shot_position),
    chapter: String(shot_chapter || '未分组'),
    title: String(shot_title || '未命名拍摄项'),
    intent: shot_intent == null ? null : String(shot_intent),
    composition_notes: shot_composition_notes == null ? null : String(shot_composition_notes),
    lighting_gear_notes: shot_lighting_gear_notes == null ? null : String(shot_lighting_gear_notes),
    status: SHOT_STATUSES.includes(String(shot_status) as ShotStatus) ? String(shot_status) as ShotStatus : 'planned',
    created_at: Number(shot_created_at),
    updated_at: Number(shot_updated_at),
    photo
  }
}

function shotSelectSql(): string {
  return `
    SELECT
      s.id AS shot_id,
      s.project_id AS shot_project_id,
      s.photo_id AS shot_photo_id,
      s.position AS shot_position,
      s.chapter AS shot_chapter,
      s.title AS shot_title,
      s.intent AS shot_intent,
      s.composition_notes AS shot_composition_notes,
      s.lighting_gear_notes AS shot_lighting_gear_notes,
      s.status AS shot_status,
      s.created_at AS shot_created_at,
      s.updated_at AS shot_updated_at,
      p.*
    FROM project_shots s
    JOIN photos p ON p.id = s.photo_id
    WHERE s.project_id = ?
    ORDER BY s.position ASC, s.id ASC
  `
}

export function listProjectShots(projectId: number): ProjectShot[] {
  return dbAdapter.query(shotSelectSql(), [projectId]).map(mapShotRow)
}

function assertPhotoBelongsToProject(projectId: number, photoId: number): Photo {
  const photo = dbAdapter.get('SELECT * FROM photos WHERE id = ?', [photoId])
  if (!photo) throw new Error('拍摄清单参考样片不存在')
  if (Number(photo.project_id) !== projectId) throw new Error('拍摄清单参考样片不属于当前项目')
  return photo as Photo
}

function normalizeOptional(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null
}

export function createProjectShot(projectId: number, photoId: number, input: ProjectShotInput = {}): ProjectShot {
  const photo = assertPhotoBelongsToProject(projectId, photoId)
  const existing = dbAdapter.get('SELECT id FROM project_shots WHERE project_id = ? AND photo_id = ?', [projectId, photoId])
  if (existing) return listProjectShots(projectId).find(shot => shot.id === Number(existing.id)) as ProjectShot

  const nextPosition = dbAdapter.get(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM project_shots WHERE project_id = ?',
    [projectId]
  )?.next_position ?? 0
  const now = Math.floor(Date.now() / 1000)
  const title = input.title?.trim() || `拍摄 ${String(Number(nextPosition) + 1).padStart(2, '0')} · ${photo.filename || '参考样片'}`
  const id = dbAdapter.insert('project_shots', {
    project_id: projectId,
    photo_id: photoId,
    position: Number(nextPosition),
    chapter: input.chapter?.trim() || '未分组',
    title,
    intent: normalizeOptional(input.intent),
    composition_notes: normalizeOptional(input.compositionNotes),
    lighting_gear_notes: normalizeOptional(input.lightingGearNotes),
    status: SHOT_STATUSES.includes(input.status || 'planned') ? input.status || 'planned' : 'planned',
    created_at: now,
    updated_at: now
  })
  saveDatabase()
  const created = id ? listProjectShots(projectId).find(shot => shot.id === id) : null
  if (!created) throw new Error('拍摄清单写入失败')
  return created
}

export function createShotsFromSelections(projectId: number): ProjectShot[] {
  const selections = dbAdapter.query(
    'SELECT photo_id, chapter FROM project_selections WHERE project_id = ? ORDER BY position, id',
    [projectId]
  )
  selections.forEach(selection => createProjectShot(projectId, Number(selection.photo_id), { chapter: String(selection.chapter || '未分组') }))
  return listProjectShots(projectId)
}

export function updateProjectShot(projectId: number, shotId: number, input: ProjectShotInput): ProjectShot {
  const current = dbAdapter.get('SELECT * FROM project_shots WHERE id = ? AND project_id = ?', [shotId, projectId])
  if (!current) throw new Error('拍摄清单项目不存在')
  const status = input.status && SHOT_STATUSES.includes(input.status) ? input.status : String(current.status) as ShotStatus
  const title = input.title?.trim() || String(current.title || '未命名拍摄项')
  const now = Math.floor(Date.now() / 1000)
  dbAdapter.run(`
    UPDATE project_shots
    SET title = ?, intent = ?, composition_notes = ?, lighting_gear_notes = ?, status = ?, updated_at = ?
    WHERE id = ? AND project_id = ?
  `, [
    title,
    normalizeOptional(input.intent),
    normalizeOptional(input.compositionNotes),
    normalizeOptional(input.lightingGearNotes),
    status,
    now,
    shotId,
    projectId
  ])
  saveDatabase()
  return listProjectShots(projectId).find(shot => shot.id === shotId) || ({ ...current, id: shotId } as ProjectShot)
}

export function reorderProjectShots(projectId: number, shotIds: number[]): ProjectShot[] {
  const current = listProjectShots(projectId)
  const currentIds = current.map(shot => shot.id)
  const nextIds = shotIds.map(Number)
  if (new Set(nextIds).size !== nextIds.length || nextIds.length !== currentIds.length) {
    throw new Error('拍摄清单顺序与当前清单不一致')
  }
  const allowed = new Set(currentIds)
  if (nextIds.some(shotId => !allowed.has(shotId))) throw new Error('包含不属于当前拍摄清单的项目')
  nextIds.forEach((shotId, position) => {
    dbAdapter.run('UPDATE project_shots SET position = ?, updated_at = ? WHERE id = ? AND project_id = ?', [position, Math.floor(Date.now() / 1000), shotId, projectId])
  })
  saveDatabase()
  return listProjectShots(projectId)
}

export function removeProjectShot(projectId: number, shotId: number): boolean {
  const result = dbAdapter.run('DELETE FROM project_shots WHERE id = ? AND project_id = ?', [shotId, projectId])
  if (result.changes > 0) saveDatabase()
  return result.changes > 0
}

export function removeShotsForPhotos(photoIds: number[]): void {
  if (photoIds.length === 0) return
  const placeholders = photoIds.map(() => '?').join(', ')
  dbAdapter.run(`DELETE FROM project_shots WHERE photo_id IN (${placeholders})`, photoIds)
}

function moveProjectShotRows(fromProjectId: number, toProjectId: number, photoIds?: number[]): void {
  const params: unknown[] = [fromProjectId]
  const photoClause = photoIds && photoIds.length > 0
    ? ` AND photo_id IN (${photoIds.map(() => '?').join(', ')})`
    : ''
  if (photoIds && photoIds.length > 0) params.push(...photoIds)
  const shots = dbAdapter.query(`SELECT id, photo_id FROM project_shots WHERE project_id = ?${photoClause} ORDER BY position, id`, params)
  for (const shot of shots) {
    const duplicate = dbAdapter.get('SELECT id FROM project_shots WHERE project_id = ? AND photo_id = ?', [toProjectId, shot.photo_id])
    if (duplicate) dbAdapter.run('DELETE FROM project_shots WHERE id = ?', [shot.id])
    else dbAdapter.run('UPDATE project_shots SET project_id = ? WHERE id = ?', [toProjectId, shot.id])
  }
}

export function moveProjectShotsForPhotos(fromProjectId: number, toProjectId: number, photoIds: number[]): void {
  moveProjectShotRows(fromProjectId, toProjectId, photoIds)
}

export function moveProjectShots(fromProjectId: number, toProjectId: number): void {
  moveProjectShotRows(fromProjectId, toProjectId)
}
