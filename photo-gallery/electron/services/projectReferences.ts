import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dbAdapter, saveDatabase } from './database'
import { normalizeMaterialSourceUrl, type MaterialMediaType, type MaterialSource } from './materialSources'
import { sanitizeDesktopFolderName } from './desktopExport'

export interface ProjectMaterialReference {
  id: number
  project_id: number
  source_type: MaterialSource
  source_item_id: string
  media_type: MaterialMediaType
  title: string
  author: string | null
  original_url: string
  metadata_json: string | null
  created_at: number
}

export interface AddProjectMaterialReferenceInput {
  projectId: number
  source: MaterialSource
  sourceItemId?: string | null
  mediaType?: MaterialMediaType
  title?: string | null
  author?: string | null
  originalUrl: string
  metadata?: Record<string, unknown> | null
}

function assertProject(projectId: number): void {
  if (!Number.isInteger(projectId) || projectId <= 0) throw new Error('项目参数无效')
  if (!dbAdapter.get('SELECT id FROM projects WHERE id = ?', [projectId])) {
    throw new Error('当前拍摄项目不存在，请重新选择项目')
  }
}

function normalizeTitle(value?: string | null): string {
  const title = typeof value === 'string' ? value.trim() : ''
  return title.slice(0, 300) || '未命名参考'
}

function normalizeAuthor(value?: string | null): string | null {
  const author = typeof value === 'string' ? value.trim() : ''
  return author ? author.slice(0, 120) : null
}

export function listProjectMaterialReferences(projectId: number): ProjectMaterialReference[] {
  assertProject(projectId)
  return dbAdapter.query(
    'SELECT * FROM project_material_references WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    [projectId]
  ) as ProjectMaterialReference[]
}

export function addProjectMaterialReference(input: AddProjectMaterialReferenceInput): { reference: ProjectMaterialReference; alreadyExists: boolean } {
  assertProject(input.projectId)
  const source = input.source
  if (source !== 'xiaohongshu' && source !== 'douyin') throw new Error('素材来源不受支持')
  const originalUrl = normalizeMaterialSourceUrl(source, input.originalUrl)
  if (!originalUrl) throw new Error('来源网址无效')

  const sourceItemId = (typeof input.sourceItemId === 'string' && input.sourceItemId.trim()
    ? input.sourceItemId.trim()
    : originalUrl).slice(0, 500)
  const existing = dbAdapter.get(
    'SELECT * FROM project_material_references WHERE project_id = ? AND source_type = ? AND source_item_id = ?',
    [input.projectId, source, sourceItemId]
  ) as ProjectMaterialReference | null
  if (existing) return { reference: existing, alreadyExists: true }

  const now = Math.floor(Date.now() / 1000)
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null
  const id = dbAdapter.insert('project_material_references', {
    project_id: input.projectId,
    source_type: source,
    source_item_id: sourceItemId,
    media_type: input.mediaType || 'link',
    title: normalizeTitle(input.title),
    author: normalizeAuthor(input.author),
    original_url: originalUrl,
    metadata_json: metadataJson,
    created_at: now
  })
  if (!id) throw new Error('远程参考写入失败')
  saveDatabase()
  const reference = dbAdapter.get('SELECT * FROM project_material_references WHERE id = ?', [id]) as ProjectMaterialReference | null
  if (!reference) throw new Error('远程参考读取失败')
  return { reference, alreadyExists: false }
}

export function copyProjectMaterialReferences(fromProjectId: number, toProjectId: number): void {
  assertProject(fromProjectId)
  assertProject(toProjectId)
  const references = dbAdapter.query(
    'SELECT source_type, source_item_id, media_type, title, author, original_url, metadata_json, created_at FROM project_material_references WHERE project_id = ? ORDER BY id',
    [fromProjectId]
  )
  for (const reference of references) {
    dbAdapter.insert('project_material_references', {
      project_id: toProjectId,
      source_type: reference.source_type,
      source_item_id: reference.source_item_id,
      media_type: reference.media_type,
      title: reference.title,
      author: reference.author ?? null,
      original_url: reference.original_url,
      metadata_json: reference.metadata_json ?? null,
      created_at: reference.created_at
    })
  }
}

export function removeProjectMaterialReference(projectId: number, referenceId: number): boolean {
  assertProject(projectId)
  const result = dbAdapter.run(
    'DELETE FROM project_material_references WHERE id = ? AND project_id = ?',
    [referenceId, projectId]
  )
  if (result.changes > 0) saveDatabase()
  return result.changes > 0
}

export function moveProjectMaterialReferences(fromProjectId: number, toProjectId: number): void {
  assertProject(toProjectId)
  const references = dbAdapter.query(
    'SELECT id, source_type, source_item_id FROM project_material_references WHERE project_id = ? ORDER BY id',
    [fromProjectId]
  )
  for (const reference of references) {
    const duplicate = dbAdapter.get(
      'SELECT id FROM project_material_references WHERE project_id = ? AND source_type = ? AND source_item_id = ?',
      [toProjectId, reference.source_type, reference.source_item_id]
    )
    if (duplicate) {
      dbAdapter.run('DELETE FROM project_material_references WHERE id = ?', [reference.id])
    } else {
      dbAdapter.run('UPDATE project_material_references SET project_id = ? WHERE id = ?', [toProjectId, reference.id])
    }
  }
}

export interface ProjectMaterialReferenceExportResult {
  success: boolean
  filePath?: string
  exported: number
  failed: number
  error?: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function exportProjectMaterialReferences(
  projectId: number,
  requestedFolderName: string,
  desktopPath: string
): ProjectMaterialReferenceExportResult {
  const references = listProjectMaterialReferences(projectId)
  if (references.length === 0) {
    return { success: true, exported: 0, failed: 0 }
  }
  const folderPath = join(desktopPath, sanitizeDesktopFolderName(requestedFolderName))
  mkdirSync(folderPath, { recursive: true })
  let filePath = join(folderPath, '参考链接.html')
  let suffix = 2
  while (existsSync(filePath)) {
    filePath = join(folderPath, `参考链接-${suffix}.html`)
    suffix += 1
  }
  const links = references.map(reference => {
    const author = reference.author ? `<small> · ${escapeHtml(reference.author)}</small>` : ''
    return `<li><a href="${escapeHtml(reference.original_url)}" rel="noreferrer noopener">${escapeHtml(reference.title)}</a><span>（${escapeHtml(reference.source_type)}${author}）</span></li>`
  }).join('\n')
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Pic 参考链接</title>
<style>body{font-family:Segoe UI,Microsoft YaHei,sans-serif;max-width:900px;margin:40px auto;line-height:1.8;color:#222}a{color:#1677ff}small{color:#666}</style>
</head><body><h1>Pic 参考链接</h1><p>以下内容保留为来源链接，不包含抖音视频下载。</p><ul>${links}</ul></body></html>`
  try {
    writeFileSync(filePath, html, { encoding: 'utf8', flag: 'wx' })
    return { success: true, filePath, exported: references.length, failed: 0 }
  } catch (error) {
    return {
      success: false,
      filePath,
      exported: 0,
      failed: references.length,
      error: error instanceof Error ? error.message : '参考链接写入失败'
    }
  }
}
