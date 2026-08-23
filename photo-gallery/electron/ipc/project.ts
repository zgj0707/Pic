import { ipcMain } from 'electron'
import { dbAdapter } from '../services/database'
import { wrapHandler } from '../utils/ipcHandler'
import type { Project } from '../types'

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
    const now = Math.floor(Date.now() / 1000)
    const id = dbAdapter.insert('projects', {
      name: name.trim(),
      description: description?.trim() || null,
      created_at: now,
      updated_at: now
    })
    return id ? { success: true, id } : { success: false, error: '创建失败' }
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
      dbAdapter.run('UPDATE photos SET project_id = ? WHERE project_id = ?', [defaultProject.id, id])
    }
    dbAdapter.run('DELETE FROM projects WHERE id = ?', [id])
    return { success: true }
  }))
}
