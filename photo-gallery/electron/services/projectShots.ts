import { dbAdapter, saveDatabase } from './database'
import type { Photo, ProjectShot, ShotGroup } from '../types'

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

export interface ShotGroupInput {
  name: string
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

function mapGroupRow(row: Record<string, unknown>): ShotGroup {
  return {
    id: Number(row.id),
    project_id: Number(row.project_id),
    name: String(row.name || '未分组'),
    position: Number(row.position || 0),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0)
  }
}

function mapShotRow(row: Record<string, unknown>): ProjectShot {
  const {
    shot_id,
    shot_group_id,
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
    group_id: Number(shot_group_id),
    project_id: Number(shot_project_id),
    photo_id: photoId,
    position: Number(shot_position),
    chapter: String(shot_chapter || '未分组'),
    title: String(shot_title || '未命名拍摄项'),
    intent: shot_intent == null ? null : String(shot_intent),
    composition_notes: shot_composition_notes == null ? null : String(shot_composition_notes),
    lighting_gear_notes: shot_lighting_gear_notes == null ? null : String(shot_lighting_gear_notes),
    status: SHOT_STATUSES.includes(String(shot_status) as ShotStatus) ? String(shot_status) as ShotStatus : 'planned',
    created_at: Number(shot_created_at || 0),
    updated_at: Number(shot_updated_at || 0),
    photo
  }
}

function shotSelectSql(): string {
  return `
    SELECT
      si.id AS shot_id,
      sg.id AS shot_group_id,
      sg.project_id AS shot_project_id,
      pr.asset_id AS shot_photo_id,
      si.position AS shot_position,
      sg.name AS shot_chapter,
      si.title AS shot_title,
      si.intent AS shot_intent,
      si.composition_notes AS shot_composition_notes,
      si.lighting_gear_notes AS shot_lighting_gear_notes,
      si.status AS shot_status,
      si.created_at AS shot_created_at,
      si.updated_at AS shot_updated_at,
      p.*
    FROM shot_items si
    JOIN shot_groups sg ON sg.id = si.group_id
    JOIN plan_references pr ON pr.id = si.reference_id
    JOIN photos p ON p.id = pr.asset_id
    WHERE sg.project_id = ?
    ORDER BY sg.position ASC, si.position ASC, si.id ASC
  `
}

export function listShotGroups(projectId: number): ShotGroup[] {
  ensureNormalizedShots(projectId)
  return dbAdapter.query(
    'SELECT * FROM shot_groups WHERE project_id = ? ORDER BY position ASC, id ASC',
    [projectId]
  ).map(mapGroupRow)
}

function assertProject(projectId: number): void {
  if (!dbAdapter.get('SELECT id FROM projects WHERE id = ?', [projectId])) throw new Error('拍摄项目不存在')
}

function normalizeGroupName(name: string): string {
  return String(name || '').trim() || '未分组'
}

function getOrCreateGroup(projectId: number, name: string): ShotGroup {
  assertProject(projectId)
  const normalized = normalizeGroupName(name)
  const existing = dbAdapter.get('SELECT * FROM shot_groups WHERE project_id = ? AND name = ?', [projectId, normalized])
  if (existing) return mapGroupRow(existing)
  const next = dbAdapter.get('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM shot_groups WHERE project_id = ?', [projectId])
  const id = dbAdapter.insert('shot_groups', {
    project_id: projectId,
    name: normalized,
    position: Number(next?.position || 0),
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000)
  })
  if (!id) throw new Error('拍摄分组写入失败')
  const created = dbAdapter.get('SELECT * FROM shot_groups WHERE id = ?', [id])
  if (!created) throw new Error('拍摄分组读取失败')
  return mapGroupRow(created)
}

function getOrCreateReference(projectId: number, photoId: number): number {
  const existing = dbAdapter.get('SELECT id FROM plan_references WHERE project_id = ? AND asset_id = ?', [projectId, photoId])
  if (existing) return Number(existing.id)
  const photo = dbAdapter.get('SELECT source_type, source_url, filename, imported_at FROM photos WHERE id = ?', [photoId])
  const id = dbAdapter.insert('plan_references', {
    project_id: projectId,
    asset_id: photoId,
    source_kind: String(photo?.source_type || 'unknown'),
    source_url: photo?.source_url ?? null,
    source_title: photo?.filename ?? null,
    captured_at: photo?.imported_at ?? null,
    created_at: Math.floor(Date.now() / 1000)
  })
  if (!id) throw new Error('样片引用写入失败')
  return id
}

/**
 * Older callers may still write the compatibility project_shots table after
 * startup (for example, an extension or an imported legacy database). Keep
 * reads self-healing so the v5 normalized model remains the source of truth
 * without forcing every caller to migrate at the same instant.
 */
function ensureNormalizedShots(projectId: number): void {
  if (!dbAdapter.get('SELECT id FROM projects WHERE id = ?', [projectId])) return
  const legacyRows = dbAdapter.query('SELECT * FROM project_shots WHERE project_id = ? ORDER BY position, id', [projectId])
  let changed = false
  for (const shot of legacyRows) {
    if (dbAdapter.get('SELECT id FROM shot_items WHERE id = ?', [Number(shot.id)])) continue
    const photoId = Number(shot.photo_id)
    try {
      const photo = assertPhotoBelongsToProject(projectId, photoId)
      const group = getOrCreateGroup(projectId, String(shot.chapter || '未分组'))
      const referenceId = getOrCreateReference(projectId, photoId)
      const data = [
        Number(shot.id), Number(group.id), referenceId, Number(shot.position || 0),
        String(shot.title || `拍摄 · ${photo.filename || '参考样片'}`), shot.intent ?? null,
        shot.composition_notes ?? null, shot.lighting_gear_notes ?? null,
        SHOT_STATUSES.includes(String(shot.status) as ShotStatus) ? String(shot.status) : 'planned',
        Number(shot.created_at || 0), Number(shot.updated_at || 0)
      ]
      const inserted = dbAdapter.run(`
        INSERT OR IGNORE INTO shot_items
          (id, group_id, reference_id, position, title, intent, composition_notes, lighting_gear_notes, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, data)
      if (inserted.changes === 0) {
        dbAdapter.insert('shot_items', {
          group_id: Number(group.id),
          reference_id: referenceId,
          position: Number(shot.position || 0),
          title: data[4],
          intent: data[5],
          composition_notes: data[6],
          lighting_gear_notes: data[7],
          status: data[8],
          created_at: data[9],
          updated_at: data[10]
        })
      }
      changed = true
    } catch {
      // Leave malformed legacy rows available to their old callers. The v5
      // read path skips them rather than inventing a cross-project relation.
    }
  }
  if (changed) saveDatabase()
}

export function listProjectShots(projectId: number): ProjectShot[] {
  ensureNormalizedShots(projectId)
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

export function createShotGroup(projectId: number, input: ShotGroupInput): ShotGroup {
  return getOrCreateGroup(projectId, input.name)
}

export function renameShotGroup(projectId: number, groupId: number, name: string): ShotGroup {
  assertProject(projectId)
  const group = dbAdapter.get('SELECT * FROM shot_groups WHERE id = ? AND project_id = ?', [groupId, projectId])
  if (!group) throw new Error('拍摄分组不存在')
  const normalized = normalizeGroupName(name)
  const duplicate = dbAdapter.get('SELECT id FROM shot_groups WHERE project_id = ? AND name = ? AND id != ?', [projectId, normalized, groupId])
  if (duplicate) throw new Error('该拍摄分组名称已存在')
  const now = Math.floor(Date.now() / 1000)
  dbAdapter.run('UPDATE shot_groups SET name = ?, updated_at = ? WHERE id = ? AND project_id = ?', [normalized, now, groupId, projectId])
  saveDatabase()
  return mapGroupRow(dbAdapter.get('SELECT * FROM shot_groups WHERE id = ?', [groupId]) || { ...group, name: normalized, updated_at: now })
}

export function reorderShotGroups(projectId: number, groupIds: number[]): ShotGroup[] {
  const current = listShotGroups(projectId)
  const ids = groupIds.map(Number)
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !current.some(group => group.id === id))) {
    throw new Error('拍摄分组顺序与当前分组不一致')
  }
  const now = Math.floor(Date.now() / 1000)
  ids.forEach((id, position) => dbAdapter.run('UPDATE shot_groups SET position = ?, updated_at = ? WHERE id = ? AND project_id = ?', [position, now, id, projectId]))
  saveDatabase()
  return listShotGroups(projectId)
}

export function removeShotGroup(projectId: number, groupId: number): boolean {
  const group = dbAdapter.get('SELECT id FROM shot_groups WHERE id = ? AND project_id = ?', [groupId, projectId])
  if (!group) return false
  const assetIds = dbAdapter.query(`
    SELECT pr.asset_id
    FROM shot_items si
    JOIN plan_references pr ON pr.id = si.reference_id
    WHERE si.group_id = ?
  `, [groupId]).map(row => Number(row.asset_id))
  dbAdapter.run('DELETE FROM shot_items WHERE group_id = ?', [groupId])
  dbAdapter.run('DELETE FROM shot_groups WHERE id = ? AND project_id = ?', [groupId, projectId])
  assetIds.forEach(assetId => {
    const stillPlanned = dbAdapter.get(`
      SELECT 1
      FROM shot_items si
      JOIN shot_groups sg ON sg.id = si.group_id
      JOIN plan_references pr ON pr.id = si.reference_id
      WHERE sg.project_id = ? AND pr.asset_id = ?
    `, [projectId, assetId])
    if (!stillPlanned) dbAdapter.run('DELETE FROM project_shots WHERE project_id = ? AND photo_id = ?', [projectId, assetId])
  })
  dbAdapter.run('DELETE FROM plan_references WHERE project_id = ? AND id NOT IN (SELECT reference_id FROM shot_items)', [projectId])
  saveDatabase()
  return true
}

export function createProjectShot(projectId: number, photoId: number, input: ProjectShotInput = {}): ProjectShot {
  const photo = assertPhotoBelongsToProject(projectId, photoId)
  const group = getOrCreateGroup(projectId, input.chapter || '未分组')
  const referenceId = getOrCreateReference(projectId, photoId)
  const existing = dbAdapter.get('SELECT id FROM shot_items WHERE group_id = ? AND reference_id = ?', [group.id, referenceId])
  if (existing) return listProjectShots(projectId).find(shot => shot.id === Number(existing.id)) as ProjectShot

  const nextPosition = dbAdapter.get('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM shot_items WHERE group_id = ?', [group.id])?.next_position ?? 0
  const now = Math.floor(Date.now() / 1000)
  const title = input.title?.trim() || `拍摄 ${String(Number(nextPosition) + 1).padStart(2, '0')} · ${photo.filename || '参考样片'}`
  const id = dbAdapter.insert('shot_items', {
    group_id: group.id,
    reference_id: referenceId,
    position: Number(nextPosition),
    title,
    intent: normalizeOptional(input.intent),
    composition_notes: normalizeOptional(input.compositionNotes),
    lighting_gear_notes: normalizeOptional(input.lightingGearNotes),
    status: SHOT_STATUSES.includes(input.status || 'planned') ? input.status || 'planned' : 'planned',
    created_at: now,
    updated_at: now
  })
  if (!id) throw new Error('拍摄清单写入失败')
  // Keep the first-generation table in sync for older project-management
  // callers. Its unique constraint intentionally stores only one mirror row.
  if (!dbAdapter.get('SELECT id FROM project_shots WHERE project_id = ? AND photo_id = ?', [projectId, photoId])) {
    dbAdapter.insert('project_shots', {
      project_id: projectId,
      photo_id: photoId,
      position: Number(nextPosition),
      chapter: group.name,
      title,
      intent: normalizeOptional(input.intent),
      composition_notes: normalizeOptional(input.compositionNotes),
      lighting_gear_notes: normalizeOptional(input.lightingGearNotes),
      status: input.status || 'planned',
      created_at: now,
      updated_at: now
    })
  }
  saveDatabase()
  const created = listProjectShots(projectId).find(shot => shot.id === id)
  if (!created) throw new Error('拍摄清单读取失败')
  return created
}

export function createShotsFromSelections(projectId: number): ProjectShot[] {
  const selections = dbAdapter.query('SELECT photo_id, chapter, note FROM project_selections WHERE project_id = ? ORDER BY position, id', [projectId])
  selections.forEach(selection => createProjectShot(projectId, Number(selection.photo_id), {
    chapter: String(selection.chapter || '未分组'),
    compositionNotes: selection.note == null ? null : String(selection.note)
  }))
  return listProjectShots(projectId)
}

export function updateProjectShot(projectId: number, shotId: number, input: ProjectShotInput): ProjectShot {
  const current = dbAdapter.get(`
    SELECT si.*, sg.project_id, sg.name AS chapter, pr.asset_id AS photo_id
    FROM shot_items si JOIN shot_groups sg ON sg.id = si.group_id JOIN plan_references pr ON pr.id = si.reference_id
    WHERE si.id = ? AND sg.project_id = ?
  `, [shotId, projectId])
  if (!current) throw new Error('拍摄清单项目不存在')
  const group = getOrCreateGroup(projectId, input.chapter || String(current.chapter || '未分组'))
  const status = input.status && SHOT_STATUSES.includes(input.status) ? input.status : String(current.status) as ShotStatus
  const title = input.title?.trim() || String(current.title || '未命名拍摄项')
  const now = Math.floor(Date.now() / 1000)
  dbAdapter.run(`
    UPDATE shot_items
    SET group_id = ?, title = ?, intent = ?, composition_notes = ?, lighting_gear_notes = ?, status = ?, updated_at = ?
    WHERE id = ?
  `, [group.id, title, normalizeOptional(input.intent), normalizeOptional(input.compositionNotes), normalizeOptional(input.lightingGearNotes), status, now, shotId])
  dbAdapter.run('UPDATE project_shots SET chapter = ?, title = ?, intent = ?, composition_notes = ?, lighting_gear_notes = ?, status = ?, updated_at = ? WHERE project_id = ? AND photo_id = ?', [group.name, title, normalizeOptional(input.intent), normalizeOptional(input.compositionNotes), normalizeOptional(input.lightingGearNotes), status, now, projectId, Number(current.photo_id)])
  saveDatabase()
  const updated = listProjectShots(projectId).find(shot => shot.id === shotId)
  if (!updated) throw new Error('拍摄清单读取失败')
  return updated
}

export function reorderProjectShots(projectId: number, shotIds: number[]): ProjectShot[] {
  const current = listProjectShots(projectId)
  const ids = shotIds.map(Number)
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !current.some(shot => shot.id === id))) {
    throw new Error('拍摄清单顺序与当前清单不一致')
  }
  const positions = new Map<number, number>()
  const groupCounts = new Map<number, number>()
  const groupOrder: number[] = []
  ids.forEach(id => {
    const shot = current.find(item => item.id === id)
    if (!shot) return
    const groupId = Number(shot.group_id)
    if (!groupOrder.includes(groupId)) groupOrder.push(groupId)
    const position = groupCounts.get(groupId) || 0
    groupCounts.set(groupId, position + 1)
    positions.set(id, position)
  })
  const now = Math.floor(Date.now() / 1000)
  groupOrder.forEach((groupId, position) => {
    dbAdapter.run('UPDATE shot_groups SET position = ?, updated_at = ? WHERE id = ? AND project_id = ?', [position, now, groupId, projectId])
  })
  positions.forEach((position, id) => {
    dbAdapter.run('UPDATE shot_items SET position = ?, updated_at = ? WHERE id = ?', [position, now, id])
    const shot = current.find(item => item.id === id)
    if (shot) dbAdapter.run('UPDATE project_shots SET position = ?, updated_at = ? WHERE project_id = ? AND photo_id = ?', [position, now, projectId, shot.photo_id])
  })
  saveDatabase()
  return listProjectShots(projectId)
}

export function removeProjectShot(projectId: number, shotId: number): boolean {
  const current = dbAdapter.get(`
    SELECT si.id, si.reference_id, pr.asset_id
    FROM shot_items si
    JOIN shot_groups sg ON sg.id = si.group_id
    JOIN plan_references pr ON pr.id = si.reference_id
    WHERE si.id = ? AND sg.project_id = ?
  `, [shotId, projectId])
  if (!current) return false
  dbAdapter.run('DELETE FROM shot_items WHERE id = ?', [shotId])
  const stillPlanned = dbAdapter.get(`
    SELECT 1
    FROM shot_items si
    JOIN shot_groups sg ON sg.id = si.group_id
    JOIN plan_references pr ON pr.id = si.reference_id
    WHERE sg.project_id = ? AND pr.asset_id = ?
  `, [projectId, Number(current.asset_id)])
  if (!stillPlanned) dbAdapter.run('DELETE FROM project_shots WHERE project_id = ? AND photo_id = ?', [projectId, Number(current.asset_id)])
  dbAdapter.run('DELETE FROM plan_references WHERE id = ? AND project_id = ? AND NOT EXISTS (SELECT 1 FROM shot_items WHERE reference_id = ?)', [Number(current.reference_id), projectId, Number(current.reference_id)])
  saveDatabase()
  return true
}

export function removeShotsForPhotos(photoIds: number[]): void {
  if (photoIds.length === 0) return
  const placeholders = photoIds.map(() => '?').join(', ')
  dbAdapter.run(`DELETE FROM shot_items WHERE reference_id IN (SELECT id FROM plan_references WHERE asset_id IN (${placeholders}))`, photoIds)
  dbAdapter.run(`DELETE FROM plan_references WHERE asset_id IN (${placeholders})`, photoIds)
  dbAdapter.run(`DELETE FROM project_shots WHERE photo_id IN (${placeholders})`, photoIds)
}

function moveProjectShotRows(fromProjectId: number, toProjectId: number, photoIds?: number[]): void {
  const fullMove = !photoIds || photoIds.length === 0
  const sourceGroups = listShotGroups(fromProjectId)
  const targetGroupBySourceId = new Map<number, number>()
  if (fullMove) {
    // A project delete must preserve even empty planning groups in the
    // receiving project. Partial photo moves intentionally leave unrelated
    // empty groups in their original project.
    sourceGroups.forEach(sourceGroup => {
      targetGroupBySourceId.set(sourceGroup.id, getOrCreateGroup(toProjectId, sourceGroup.name).id)
    })
  }
  const params: unknown[] = [fromProjectId]
  const photoClause = photoIds && photoIds.length > 0 ? ` AND pr.asset_id IN (${photoIds.map(() => '?').join(', ')})` : ''
  if (photoIds && photoIds.length > 0) params.push(...photoIds)
  const touchedSourceGroupIds = new Set<number>()
  const rows = dbAdapter.query(`
    SELECT si.id, si.group_id, si.reference_id, sg.name AS group_name, pr.asset_id
    FROM shot_items si JOIN shot_groups sg ON sg.id = si.group_id JOIN plan_references pr ON pr.id = si.reference_id
    WHERE sg.project_id = ?${photoClause} ORDER BY sg.position, si.position, si.id
  `, params)
  for (const row of rows) {
    touchedSourceGroupIds.add(Number(row.group_id))
    const sourceGroup = dbAdapter.get('SELECT * FROM shot_groups WHERE id = ?', [Number(row.group_id)])
    const targetGroupId = targetGroupBySourceId.get(Number(row.group_id))
    const targetGroup = targetGroupId
      ? ({ id: targetGroupId } as ShotGroup)
      : getOrCreateGroup(toProjectId, String(sourceGroup?.name || row.group_name || '未分组'))
    const existingRef = dbAdapter.get('SELECT id FROM plan_references WHERE project_id = ? AND asset_id = ?', [toProjectId, Number(row.asset_id)])
    let targetRefId = existingRef ? Number(existingRef.id) : null
    if (!targetRefId) {
      const sourceRef = dbAdapter.get('SELECT * FROM plan_references WHERE id = ?', [Number(row.reference_id)])
      targetRefId = dbAdapter.insert('plan_references', {
        project_id: toProjectId,
        asset_id: Number(row.asset_id),
        source_kind: sourceRef?.source_kind || 'unknown',
        source_url: sourceRef?.source_url || null,
        source_title: sourceRef?.source_title || null,
        captured_at: sourceRef?.captured_at || null,
        created_at: sourceRef?.created_at || Math.floor(Date.now() / 1000)
      })
    }
    const duplicate = targetRefId ? dbAdapter.get('SELECT id FROM shot_items WHERE group_id = ? AND reference_id = ?', [targetGroup.id, targetRefId]) : null
    if (duplicate) dbAdapter.run('DELETE FROM shot_items WHERE id = ?', [Number(row.id)])
    else if (targetRefId) dbAdapter.run('UPDATE shot_items SET group_id = ?, reference_id = ? WHERE id = ?', [targetGroup.id, targetRefId, Number(row.id)])
  }
  if (fullMove) {
    dbAdapter.run('DELETE FROM shot_groups WHERE project_id = ?', [fromProjectId])
  } else if (touchedSourceGroupIds.size > 0) {
    const touchedIds = Array.from(touchedSourceGroupIds)
    dbAdapter.run(`DELETE FROM shot_groups WHERE project_id = ? AND id IN (${touchedIds.map(() => '?').join(', ')}) AND NOT EXISTS (SELECT 1 FROM shot_items WHERE group_id = shot_groups.id)`, [fromProjectId, ...touchedIds])
  }

  // References are project-scoped planning records, not only the rows that
  // currently have a ShotItem. Move unplanned references as well so a project
  // delete or selected-photo move does not silently discard their source
  // metadata. If the target already has the same asset reference, keep the
  // target row and remove the now-unreferenced source duplicate.
  const referenceParams: unknown[] = [fromProjectId]
  const referenceClause = photoIds && photoIds.length > 0 ? ` AND asset_id IN (${photoIds.map(() => '?').join(', ')})` : ''
  if (photoIds && photoIds.length > 0) referenceParams.push(...photoIds)
  const references = dbAdapter.query(`SELECT * FROM plan_references WHERE project_id = ?${referenceClause}`, referenceParams)
  for (const reference of references) {
    const assetId = Number(reference.asset_id)
    const targetReference = dbAdapter.get('SELECT id FROM plan_references WHERE project_id = ? AND asset_id = ?', [toProjectId, assetId])
    if (targetReference) {
      dbAdapter.run('UPDATE shot_items SET reference_id = ? WHERE reference_id = ?', [Number(targetReference.id), Number(reference.id)])
      dbAdapter.run('DELETE FROM plan_references WHERE id = ?', [Number(reference.id)])
    } else {
      dbAdapter.run('UPDATE plan_references SET project_id = ? WHERE id = ?', [toProjectId, Number(reference.id)])
    }
  }

  const legacyParams: unknown[] = [fromProjectId]
  const legacyClause = photoIds && photoIds.length > 0 ? ` AND photo_id IN (${photoIds.map(() => '?').join(', ')})` : ''
  if (photoIds && photoIds.length > 0) legacyParams.push(...photoIds)
  const legacyRows = dbAdapter.query(`SELECT id, photo_id FROM project_shots WHERE project_id = ?${legacyClause}`, legacyParams)
  for (const legacyRow of legacyRows) {
    const photoId = Number(legacyRow.photo_id)
    const targetMirror = dbAdapter.get('SELECT id FROM project_shots WHERE project_id = ? AND photo_id = ?', [toProjectId, photoId])
    if (targetMirror && Number(targetMirror.id) !== Number(legacyRow.id)) {
      dbAdapter.run('DELETE FROM project_shots WHERE id = ?', [Number(legacyRow.id)])
    } else {
      dbAdapter.run('UPDATE project_shots SET project_id = ? WHERE id = ?', [toProjectId, Number(legacyRow.id)])
    }
  }
}

export function moveProjectShotsForPhotos(fromProjectId: number, toProjectId: number, photoIds: number[]): void {
  moveProjectShotRows(fromProjectId, toProjectId, photoIds)
}

export function moveProjectShots(fromProjectId: number, toProjectId: number): void {
  moveProjectShotRows(fromProjectId, toProjectId)
}

export function copyProjectShots(fromProjectId: number, toProjectId: number): void {
  const groups = listShotGroups(fromProjectId)
  const groupMap = new Map<number, number>()
  groups.forEach(group => {
    const copied = getOrCreateGroup(toProjectId, group.name)
    groupMap.set(group.id, copied.id)
  })
  const shots = dbAdapter.query(`
    SELECT si.*, pr.asset_id, pr.source_kind, pr.source_url, pr.source_title, pr.captured_at
    FROM shot_items si JOIN shot_groups sg ON sg.id = si.group_id JOIN plan_references pr ON pr.id = si.reference_id
    WHERE sg.project_id = ? ORDER BY sg.position, si.position, si.id
  `, [fromProjectId])
  shots.forEach(shot => {
    const groupId = groupMap.get(Number(shot.group_id))
    if (!groupId) return
    const existingReference = dbAdapter.get('SELECT id FROM plan_references WHERE project_id = ? AND asset_id = ?', [toProjectId, Number(shot.asset_id)])
    const referenceId = existingReference
      ? Number(existingReference.id)
      : dbAdapter.insert('plan_references', {
        project_id: toProjectId,
        asset_id: Number(shot.asset_id),
        source_kind: shot.source_kind || 'unknown',
        source_url: shot.source_url ?? null,
        source_title: shot.source_title ?? null,
        captured_at: shot.captured_at ?? null,
        created_at: shot.created_at || Math.floor(Date.now() / 1000)
      })
    if (!referenceId) return
    if (dbAdapter.get('SELECT id FROM shot_items WHERE group_id = ? AND reference_id = ?', [groupId, referenceId])) return
    dbAdapter.insert('shot_items', {
      group_id: groupId,
      reference_id: referenceId,
      position: Number(shot.position || 0),
      title: shot.title,
      intent: shot.intent ?? null,
      composition_notes: shot.composition_notes ?? null,
      lighting_gear_notes: shot.lighting_gear_notes ?? null,
      status: shot.status || 'planned',
      created_at: shot.created_at || Math.floor(Date.now() / 1000),
      updated_at: shot.updated_at || Math.floor(Date.now() / 1000)
    })
  })
  saveDatabase()
}
