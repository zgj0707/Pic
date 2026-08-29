import { dbAdapter, saveDatabase } from './database'
import { moveProjectSelections } from './projectSelections'
import { moveProjectShots } from './projectShots'
import { moveProjectExports } from './planningExports'
import { copyProjectMaterialReferences, moveProjectMaterialReferences } from './projectReferences'

export interface DuplicateProjectResult {
  success: boolean
  id?: number
  name?: string
  error?: string
}

export interface DeleteProjectResult {
  success: boolean
  targetProjectId?: number
  targetProjectName?: string
  movedPhotos?: number
  error?: string
}

function nextCopyName(sourceName: string): string {
  const names = new Set(dbAdapter.query('SELECT name FROM projects').map(row => String(row.name)))
  const base = `${sourceName} 副本`
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base} (${index})`)) index += 1
  return `${base} (${index})`
}

export function duplicateProject(sourceProjectId: number): DuplicateProjectResult {
  const source = dbAdapter.get('SELECT * FROM projects WHERE id = ?', [sourceProjectId])
  if (!source) return { success: false, error: '项目不存在或已被删除' }
  const now = Math.floor(Date.now() / 1000)
  const name = nextCopyName(String(source.name))
  const id = dbAdapter.insert('projects', {
    name,
    description: source.description ?? null,
    client_name: source.client_name ?? null,
    shoot_date: source.shoot_date ?? null,
    location: source.location ?? null,
    owner: source.owner ?? null,
    deliverable_goal: source.deliverable_goal ?? null,
    cover_photo_id: null,
    created_at: now,
    updated_at: now
  })
  if (id === null) return { success: false, error: '复制项目失败' }
  copyProjectMaterialReferences(sourceProjectId, id)
  saveDatabase()
  return { success: true, id, name }
}

function createFallbackProject(): { id: number; name: string } {
  const existingNames = new Set(dbAdapter.query('SELECT name FROM projects').map(row => String(row.name)))
  let name = '未分类项目'
  let index = 2
  while (existingNames.has(name)) {
    name = `未分类项目 ${index}`
    index += 1
  }
  const now = Math.floor(Date.now() / 1000)
  const id = dbAdapter.insert('projects', {
    name,
    description: '删除原项目后自动接收其样片',
    created_at: now,
    updated_at: now
  })
  if (id === null) throw new Error('无法创建样片接收项目')
  return { id, name }
}

export function deleteProjectAndMoveContents(projectId: number): DeleteProjectResult {
  const source = dbAdapter.get('SELECT id, name FROM projects WHERE id = ?', [projectId])
  if (!source) return { success: false, error: '项目不存在或已被删除' }

  let target = dbAdapter.get('SELECT id, name FROM projects WHERE id != ? ORDER BY updated_at DESC, id ASC LIMIT 1', [projectId])
  if (!target) target = createFallbackProject()

  const movedPhotos = Number(dbAdapter.get('SELECT COUNT(*) AS count FROM photos WHERE project_id = ?', [projectId])?.count || 0)
  const targetProjectId = Number(target.id)
  moveProjectSelections(projectId, targetProjectId)
  moveProjectShots(projectId, targetProjectId)
  moveProjectExports(projectId, targetProjectId)
  moveProjectMaterialReferences(projectId, targetProjectId)
  dbAdapter.run('UPDATE photos SET project_id = ? WHERE project_id = ?', [targetProjectId, projectId])
  dbAdapter.run('DELETE FROM projects WHERE id = ?', [projectId])
  saveDatabase()

  return {
    success: true,
    targetProjectId,
    targetProjectName: String(target.name),
    movedPhotos
  }
}
