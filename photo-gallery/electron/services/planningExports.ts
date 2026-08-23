import { dbAdapter, saveDatabase } from './database'

export type PlanningExportKind = 'moodboard' | 'shot-list' | 'reference-package'

export interface ProjectExport {
  id: number
  project_id: number
  kind: PlanningExportKind
  target_path: string
  item_count: number
  created_at: number
}

const EXPORT_KINDS: PlanningExportKind[] = ['moodboard', 'shot-list', 'reference-package']

function mapExport(row: Record<string, unknown>): ProjectExport {
  const kind = String(row.kind)
  return {
    id: Number(row.id),
    project_id: Number(row.project_id),
    kind: EXPORT_KINDS.includes(kind as PlanningExportKind) ? kind as PlanningExportKind : 'reference-package',
    target_path: String(row.target_path || ''),
    item_count: Number(row.item_count || 0),
    created_at: Number(row.created_at || 0)
  }
}

export function recordProjectExport(
  projectId: number,
  kind: PlanningExportKind,
  targetPath: string,
  itemCount: number
): ProjectExport {
  if (!dbAdapter.get('SELECT id FROM projects WHERE id = ?', [projectId])) throw new Error('拍摄项目不存在')
  if (!EXPORT_KINDS.includes(kind)) throw new Error('不支持的方案导出类型')
  const normalizedPath = String(targetPath || '').trim()
  if (!normalizedPath) throw new Error('导出路径不能为空')
  const id = dbAdapter.insert('project_exports', {
    project_id: projectId,
    kind,
    target_path: normalizedPath,
    item_count: Math.max(0, Math.floor(Number(itemCount) || 0)),
    created_at: Math.floor(Date.now() / 1000)
  })
  saveDatabase()
  const row = id ? dbAdapter.get('SELECT * FROM project_exports WHERE id = ?', [id]) : null
  if (!row) throw new Error('导出记录写入失败')
  return mapExport(row)
}

export function listProjectExports(projectId: number): ProjectExport[] {
  return dbAdapter.query(
    'SELECT * FROM project_exports WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    [projectId]
  ).map(mapExport)
}
export function moveProjectExports(fromProjectId: number, toProjectId: number): void {
  dbAdapter.run('UPDATE project_exports SET project_id = ? WHERE project_id = ?', [toProjectId, fromProjectId])
}

export function removeProjectExports(projectId: number): void {
  dbAdapter.run('DELETE FROM project_exports WHERE project_id = ?', [projectId])
}