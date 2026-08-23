import { ipcMain } from 'electron'
import { dbAdapter } from '../services/database'
import { wrapHandler } from '../utils/ipcHandler'
import type { Project } from '../types'
import { moveProjectSelections } from '../services/projectSelections'
import { moveProjectShots } from '../services/projectShots'
import { moveProjectExports, removeProjectExports } from '../services/planningExports'

export function registerProjectIpc(): void {
  ipcMain.handle('projects:getAll', wrapHandler('projects:getAll', () => {
    const projects = dbAdapter.query(`
      SELECT p.*, COUNT(ph.id) as photo_count
      FROM projects p
      LEFT JOIN photos ph ON ph.project_id = p.id AND ph.deleted_at IS NULL
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

  ipcMain.handle('projects:delete', wrapHandler('projects:delete', (_event, id: number) => {
    // 删除项目时，将项目下的照片移动到默认项目而不是一起删除
    const defaultProject = dbAdapter.get('SELECT id FROM projects WHERE id != ? ORDER BY id ASC LIMIT 1', [id])
    if (defaultProject) {
      moveProjectSelections(id, Number(defaultProject.id))
      moveProjectShots(id, Number(defaultProject.id))
      moveProjectExports(id, Number(defaultProject.id))
      dbAdapter.run('UPDATE photos SET project_id = ? WHERE project_id = ?', [defaultProject.id, id])
    } else {
      dbAdapter.run('DELETE FROM project_selections WHERE project_id = ?', [id])
      dbAdapter.run('DELETE FROM project_shots WHERE project_id = ?', [id])
      removeProjectExports(id)
    }
    dbAdapter.run('DELETE FROM projects WHERE id = ?', [id])
    return { success: true }
  }))
}
