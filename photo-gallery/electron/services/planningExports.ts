import type { BrowserWindow } from 'electron'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync, mkdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import { dbAdapter, saveDatabase } from './database'
import { listProjectShots } from './projectShots'
import { availablePdfPath } from './pdfExport'
import type { PlanningPdfExportResult, PlanningPdfPreflightResult, ProjectShot } from '../types'

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

export interface PlanningPdfExportContext {
  app: { getPath(name: string): string }
  BrowserWindow: typeof import('electron').BrowserWindow
}

interface PreparedPlanningItem {
  shot: ProjectShot
  imageDataUrl: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function preparePlanningImage(sourcePath: string): Promise<string> {
  const sharp = await import('sharp')
  const sourceData = readFileSync(sourcePath)
  const result = await sharp.default(sourceData)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer()
  return `data:image/jpeg;base64,${result.toString('base64')}`
}

export function buildPlanningHtml(projectName: string, project: Record<string, unknown> | null, items: PreparedPlanningItem[]): string {
  const groups = new Map<string, PreparedPlanningItem[]>()
  for (const item of items) {
    const chapter = item.shot.chapter.trim() || '未分组'
    const current = groups.get(chapter) || []
    current.push(item)
    groups.set(chapter, current)
  }

  const metadata = [
    project?.shoot_date ? `拍摄日期：${escapeHtml(project.shoot_date)}` : '',
    project?.location ? `地点：${escapeHtml(project.location)}` : '',
    `生成时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}`
  ].filter(Boolean).join('　')

  const groupsHtml = Array.from(groups.entries()).map(([chapter, chapterItems]) => `
    <section class="chapter">
      <h2>${escapeHtml(chapter)} <small>${chapterItems.length} 张</small></h2>
      <div class="items">
        ${chapterItems.map((item, index) => {
          const shot = item.shot
          const notes = [
            shot.intent ? `<p><b>拍摄意图</b>${escapeHtml(shot.intent)}</p>` : '',
            shot.composition_notes ? `<p><b>构图/动作</b>${escapeHtml(shot.composition_notes)}</p>` : '',
            shot.lighting_gear_notes ? `<p><b>灯光/器材</b>${escapeHtml(shot.lighting_gear_notes)}</p>` : ''
          ].filter(Boolean).join('')
          return `
            <article class="item">
              <div class="index">${index + 1}</div>
              <img src="${item.imageDataUrl}" alt="${escapeHtml(shot.title)}">
              <div class="caption">
                <h3>${escapeHtml(shot.title)}</h3>
                <p class="filename">${escapeHtml(basename(shot.photo.filepath))}</p>
                ${notes || '<p class="muted">暂无拍摄备注</p>'}
                <p class="check">□ 现场确认 &nbsp; □ 已完成</p>
              </div>
            </article>`
        }).join('')}
      </div>
    </section>`).join('')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(projectName)} · 拍摄方案</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #202124; font-family: "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; font-size: 11px; }
  header { border-bottom: 2px solid #222; margin-bottom: 18px; padding-bottom: 10px; }
  h1 { font-size: 25px; margin: 0 0 5px; }
  .meta { color: #666; font-size: 10px; }
  .chapter { break-before: auto; margin: 0 0 18px; }
  .chapter + .chapter { break-before: page; }
  h2 { border-bottom: 1px solid #aaa; font-size: 17px; margin: 0 0 10px; padding-bottom: 5px; }
  h2 small { color: #777; font-size: 10px; font-weight: normal; }
  .items { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .item { border: 1px solid #d8d8d8; border-radius: 5px; break-inside: avoid; overflow: hidden; position: relative; }
  .item img { background: #f4f4f4; display: block; height: 145px; object-fit: contain; width: 100%; }
  .index { background: #222; border-radius: 0 0 4px 0; color: white; font-size: 10px; left: 0; padding: 3px 7px; position: absolute; top: 0; z-index: 1; }
  .caption { padding: 7px 9px 8px; }
  h3 { font-size: 12px; margin: 0 0 3px; }
  p { line-height: 1.4; margin: 3px 0; }
  p b { color: #555; display: inline-block; margin-right: 4px; }
  .filename, .muted { color: #888; font-size: 9px; }
  .check { border-top: 1px dashed #ccc; color: #555; margin-top: 6px; padding-top: 4px; }
</style></head><body>
  <header><h1>${escapeHtml(projectName)} · 拍摄方案</h1><div class="meta">${metadata}</div></header>
  ${groupsHtml || '<p>暂无可导出的拍摄条目。</p>'}
</body></html>`
}

export function preflightProjectPlanningPdf(projectId: number): PlanningPdfPreflightResult {
  const project = dbAdapter.get('SELECT id FROM projects WHERE id = ?', [projectId])
  if (!project) throw new Error('拍摄项目不存在')
  const shots = listProjectShots(projectId)
  const items = shots.map(shot => {
    const filename = basename(shot.photo.filepath || shot.photo.filename || '未命名样片')
    if (!shot.photo.filepath || !existsSync(shot.photo.filepath)) {
      return { shotId: shot.id, photoId: shot.photo_id, filename, ready: false, error: '原图文件不存在' }
    }
    try {
      const stat = statSync(shot.photo.filepath)
      if (!stat.isFile() || stat.size === 0) return { shotId: shot.id, photoId: shot.photo_id, filename, ready: false, error: '原图文件为空' }
      return { shotId: shot.id, photoId: shot.photo_id, filename, ready: true }
    } catch {
      return { shotId: shot.id, photoId: shot.photo_id, filename, ready: false, error: '原图无法读取' }
    }
  })
  const ready = items.filter(item => item.ready).length
  const missing = items.length - ready
  return {
    success: items.length > 0 && ready > 0,
    total: items.length,
    ready,
    missing,
    items,
    error: items.length === 0 ? '拍摄清单为空' : undefined
  }
}

export async function exportProjectPlanningPdf(
  projectId: number,
  requestedBaseName: string,
  context: PlanningPdfExportContext
): Promise<PlanningPdfExportResult> {
  const project = dbAdapter.get('SELECT name, shoot_date, location FROM projects WHERE id = ?', [projectId])
  if (!project) throw new Error('拍摄项目不存在')

  const shots = listProjectShots(projectId)
  if (shots.length === 0) {
    return { success: false, exported: 0, failed: 0, results: [], error: '拍摄清单为空' }
  }

  const results: PlanningPdfExportResult['results'] = []
  const items: PreparedPlanningItem[] = []
  for (const shot of shots) {
    if (!shot.photo.filepath || !existsSync(shot.photo.filepath)) {
      results.push({ shotId: shot.id, photoId: shot.photo_id, success: false, error: '原图文件不存在' })
      continue
    }
    try {
      items.push({ shot, imageDataUrl: await preparePlanningImage(shot.photo.filepath) })
      results.push({ shotId: shot.id, photoId: shot.photo_id, success: true })
    } catch (error) {
      results.push({ shotId: shot.id, photoId: shot.photo_id, success: false, error: error instanceof Error ? error.message : '图片处理失败' })
    }
  }

  if (items.length === 0) {
    return { success: false, exported: 0, failed: results.length, results, error: '没有可导出的有效样片' }
  }

  const desktopPath = context.app.getPath('desktop')
  if (!desktopPath || !existsSync(desktopPath)) {
    return { success: false, exported: 0, failed: results.length, results, error: '桌面目录不存在' }
  }

  const targetPath = availablePdfPath(desktopPath, requestedBaseName)
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  const temporaryDir = mkdtempSync(join(tmpdir(), 'pic-planning-'))
  const htmlPath = join(temporaryDir, 'plan.html')
  let window: BrowserWindow | null = null
  try {
    mkdirSync(desktopPath, { recursive: true })
    writeFileSync(htmlPath, buildPlanningHtml(String(project.name || 'Pic'), project, items), 'utf-8')
    window = new context.BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await window.loadFile(htmlPath)
    const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } })
    writeFileSync(temporaryPath, pdf)
    renameSync(temporaryPath, targetPath)
  } catch (error) {
    try { rmSync(temporaryPath, { force: true }) } catch { /* best effort cleanup */ }
    return { success: false, exported: 0, failed: results.length, results, error: error instanceof Error ? error.message : 'PDF 写入失败' }
  } finally {
    if (window && !window.isDestroyed()) window.close()
    try { rmSync(temporaryDir, { recursive: true, force: true }) } catch { /* best effort cleanup */ }
  }

  const failed = results.filter(result => !result.success).length
  recordProjectExport(projectId, 'shot-list', targetPath, items.length)
  return {
    success: failed === 0,
    filePath: targetPath,
    exported: items.length,
    failed,
    results,
    error: failed > 0 ? `${failed} 张样片未能加入 PDF` : undefined
  }
}
