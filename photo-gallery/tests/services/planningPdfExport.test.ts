import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildPlanningHtml } from '../../electron/services/planningExports'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'
import { exportProjectPlanningPdf } from '../../electron/services/planningExports'
import type { Photo, ProjectShot } from '../../electron/types'

function shot(id: number, chapter: string, title: string, notes: string): ProjectShot {
  const photo: Photo = {
    id,
    filename: `${id}.jpg`,
    filepath: `C:/references/${id}.jpg`,
    filesize: 1,
    width: 100,
    height: 100,
    created_at: 0,
    imported_at: 0,
    rating: 0,
    is_favorite: 0,
    thumbnail_path: null,
    exif_json: null,
    review_state: 'unreviewed'
  }
  return {
    id,
    project_id: 1,
    photo_id: id,
    position: id,
    chapter,
    title,
    intent: null,
    composition_notes: notes,
    lighting_gear_notes: null,
    status: 'planned',
    created_at: 0,
    updated_at: 0,
    photo
  }
}

describe('planning PDF HTML model', () => {
  it('keeps group and item order while escaping titles and rendering notes', () => {
    const html = buildPlanningHtml('春日 <方案>', { shoot_date: '2026-08-30', location: '棚拍' }, [
      { shot: shot(1, '窗边光', '第一 <样片>', '参考机位 & 姿势'), imageDataUrl: 'data:image/jpeg;base64,one' },
      { shot: shot(2, '夜景', '第二样片', ''), imageDataUrl: 'data:image/jpeg;base64,two' }
    ])

    expect(html.indexOf('窗边光')).toBeLessThan(html.indexOf('夜景'))
    expect(html.indexOf('第一 &lt;样片&gt;')).toBeLessThan(html.indexOf('第二样片'))
    expect(html).toContain('参考机位 &amp; 姿势')
    expect(html).toContain('data:image/jpeg;base64,one')
    expect(html).toContain('□ 现场确认')
  })
})

describe('planning PDF preflight', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('reports missing reference files without opening a print window', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-planning-pdf-preflight-'))
    await initializeDatabase(tempDir)
    const projectId = dbAdapter.insert('projects', { name: '缺失样片方案', description: '测试' }) || 0
    const photoId = dbAdapter.insert('photos', {
      filename: 'missing.jpg',
      filepath: join(tempDir, 'missing.jpg'),
      project_id: projectId
    }) || 0
    dbAdapter.insert('project_shots', {
      project_id: projectId,
      photo_id: photoId,
      position: 0,
      chapter: '第一组',
      title: '缺失样片'
    })

    const result = await exportProjectPlanningPdf(projectId, '缺失方案', {
      app: { getPath: () => tempDir },
      BrowserWindow: undefined as never
    })

    expect(result.success).toBe(false)
    expect(result.exported).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.results[0]).toMatchObject({ shotId: 1, photoId, success: false, error: '原图文件不存在' })
  })
})
