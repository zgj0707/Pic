import { ipcMain } from 'electron'
import { dbAdapter } from '../services/database'
import { wrapHandler } from '../utils/ipcHandler'
import type { Project, ProjectBriefInput } from '../types'
import { deleteProjectAndMoveContents, duplicateProject, movePhotosToProject } from '../services/projectManagement'

export function registerProjectIpc(): void {
  ipcMain.handle('projects:getAll', wrapHandler('projects:getAll', () => {
    const projects = dbAdapter.query(`
      SELECT p.*, cp.thumbnail_path AS cover_thumbnail_path, cp.filepath AS cover_filepath, COUNT(ph.id) as photo_count
      FROM projects p
      LEFT JOIN photos ph ON ph.project_id = p.id AND ph.deleted_at IS NULL
      LEFT JOIN photos cp ON cp.id = p.cover_photo_id AND cp.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `) as Project[]
    return projects
  }))

  ipcMain.handle('projects:getById', wrapHandler('projects:getById', (_event, id: number) => {
    return dbAdapter.get('SELECT * FROM projects WHERE id = ?', [id])
  }))

  ipcMain.handle('projects:create', wrapHandler('projects:create', (_event, name: string, description?: string) => {
    const normalizedName = typeof name === 'string' ? name.trim() : ''
    const normalizedDescription = typeof description === 'string' ? description.trim() : ''
    if (!normalizedName) {
      return { success: false, error: '项目名称不能为空' }
    }

    const now = Math.floor(Date.now() / 1000)
    const id = dbAdapter.insert('projects', {
      name: normalizedName,
      description: normalizedDescription || null,
      created_at: now,
      updated_at: now
    })
    return id ? { success: true, id } : { success: false, error: '创建失败，请检查数据库状态' }
  }))

  ipcMain.handle('projects:update', wrapHandler('projects:update', (_event, id: number, name: string, description?: string) => {
    const now = Math.floor(Date.now() / 1000)
    dbAdapter.run(
      'UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?',
      [name.trim(), description?.trim() || null, now, id]
    )
    return { success: true }
  }))

  ipcMain.handle('projects:updateBrief', wrapHandler('projects:updateBrief', (_event, id: number, input: ProjectBriefInput) => {
    const name = typeof input?.name === 'string' ? input.name.trim() : ''
    if (!name) return { success: false, error: '项目名称不能为空' }
    const text = (value?: string | null): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
    const rawCoverPhotoId = input.coverPhotoId
    const coverPhotoId = rawCoverPhotoId === null || rawCoverPhotoId === undefined
      ? null
      : (Number.isInteger(Number(rawCoverPhotoId)) && Number(rawCoverPhotoId) > 0 ? Number(rawCoverPhotoId) : null)
    if (coverPhotoId !== null) {
      const cover = dbAdapter.get('SELECT id FROM photos WHERE id = ? AND project_id = ? AND deleted_at IS NULL', [coverPhotoId, id])
      if (!cover) return { success: false, error: '封面样片不属于当前项目或已被删除' }
    }
    const now = Math.floor(Date.now() / 1000)
    dbAdapter.run(
      'UPDATE projects SET name = ?, description = ?, client_name = ?, shoot_date = ?, location = ?, owner = ?, deliverable_goal = ?, cover_photo_id = ?, updated_at = ? WHERE id = ?',
      [name, text(input.description), text(input.clientName), text(input.shootDate), text(input.location), text(input.owner), text(input.deliverableGoal), coverPhotoId, now, id]
    )
    return { success: true }
  }))

  ipcMain.handle('projects:duplicate', wrapHandler('projects:duplicate', (_event, id: number) => {
    return duplicateProject(id)
  }))

  ipcMain.handle('projects:delete', wrapHandler('projects:delete', (_event, id: number) => {
    return deleteProjectAndMoveContents(id)
  }))

  ipcMain.handle('projects:movePhotos', wrapHandler('projects:movePhotos', (
    _event,
    sourceProjectId: number,
    targetProjectId: number,
    photoIds: number[]
  ) => {
    return movePhotosToProject(Number(sourceProjectId), Number(targetProjectId), photoIds)
  }))
}
