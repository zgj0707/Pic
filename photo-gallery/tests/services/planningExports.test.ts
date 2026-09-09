import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'
import { buildPlanningHtml, listProjectExports, orderShotsForExport, recordProjectExport } from '../../electron/services/planningExports'
import { SHOT_LANES, SHOT_LANE_UNFILED, type ProjectShot } from '../../electron/types'

describe('planning export records', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('records export kind, path, count, and project scope without delivered_at', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-planning-exports-'))
    await initializeDatabase(tempDir)
    const projectId = dbAdapter.insert('projects', { name: '方案记录测试', description: '拍摄前准备' }) || 0

    const record = recordProjectExport(projectId, 'shot-list', 'C:/Desktop/Pic-Shot-List.pdf', 3)
    expect(record).toMatchObject({ project_id: projectId, kind: 'shot-list', target_path: 'C:/Desktop/Pic-Shot-List.pdf', item_count: 3 })
    expect(listProjectExports(projectId)).toHaveLength(1)
    expect(dbAdapter.query('PRAGMA table_info(photos)').map(column => column.name)).toContain('delivered_at')
    expect(dbAdapter.query('SELECT delivered_at FROM photos')).toHaveLength(0)
  })
})

function fakeShot(id: number, chapter: string, position: number): ProjectShot {
  return {
    id,
    project_id: 1,
    photo_id: id,
    position,
    chapter,
    title: `镜头 ${id}`,
    intent: null,
    composition_notes: null,
    lighting_gear_notes: null,
    status: 'planned',
    created_at: 0,
    updated_at: 0,
    photo: { id, filename: `p-${id}.jpg`, filepath: `C:/p-${id}.jpg` } as ProjectShot['photo']
  }
}

describe('planning pdf export lane ordering (v6)', () => {
  it('orders shots by the fixed five-lane sequence with the unfiled lane last', () => {
    const shots = [
      fakeShot(1, SHOT_LANE_UNFILED, 0),
      fakeShot(2, '特写', 0),
      fakeShot(3, '远景', 1),
      fakeShot(4, '空镜', 0),
      fakeShot(5, '远景', 0),
      fakeShot(6, '中景', 0),
      fakeShot(7, '近景', 0)
    ]

    const ordered = orderShotsForExport(shots)
    // 五景别固定顺序、待归类最后；远景两条（id 3/5）按稳定排序保留输入次序
    expect(ordered.map(shot => shot.id)).toEqual([3, 5, 6, 7, 2, 4, 1])
    expect(ordered.map(shot => shot.chapter)).toEqual(['远景', '远景', '中景', '近景', '特写', '空镜', SHOT_LANE_UNFILED])
  })

  it('keeps unknown chapter names after the known lanes', () => {
    const shots = [fakeShot(1, '未知分组', 0), fakeShot(2, '中景', 0)]
    expect(orderShotsForExport(shots).map(shot => shot.id)).toEqual([2, 1])
  })

  it('emits pdf chapters in the fixed lane order via buildPlanningHtml', () => {
    const shots = [fakeShot(1, SHOT_LANE_UNFILED, 0), fakeShot(2, '特写', 0), fakeShot(3, '远景', 0)]
    const items = orderShotsForExport(shots).map(shot => ({ shot, imageDataUrl: 'data:image/jpeg;base64,x' }))
    const html = buildPlanningHtml('测试项目', null, items)

    const farIndex = html.indexOf('远景')
    const closeIndex = html.indexOf('特写')
    const unfiledIndex = html.indexOf(SHOT_LANE_UNFILED)
    expect(farIndex).toBeGreaterThan(-1)
    expect(closeIndex).toBeGreaterThan(farIndex)
    expect(unfiledIndex).toBeGreaterThan(closeIndex)
  })
})