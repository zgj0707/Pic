import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { addProjectSelection, updateProjectSelectionMeta } from '../../electron/services/projectSelections'
import {
  copyProjectShot,
  createShotGroup,
  createProjectShot,
  createShotsFromSelections,
  listShotGroups,
  listProjectShots,
  listShotsByLane,
  removeProjectShot,
  reorderProjectShots,
  removeShotsForPhotos,
  updateProjectShot
} from '../../electron/services/projectShots'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'
import { SHOT_LANES, SHOT_LANE_UNFILED } from '../../electron/types'

describe('project shot list (v6 five-lane storyboard)', () => {
  let tempDir = ''
  let projectA = 0
  let projectB = 0
  let photoA1 = 0
  let photoA2 = 0

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  async function setupDatabase() {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-project-shots-'))
    mkdirSync(join(tempDir, 'database'), { recursive: true })
    await initializeDatabase(tempDir)
    projectA = dbAdapter.insert('projects', { name: '拍摄项目 A', description: null }) || 0
    projectB = dbAdapter.insert('projects', { name: '拍摄项目 B', description: null }) || 0
    photoA1 = dbAdapter.insert('photos', { filename: 'a-1.jpg', filepath: 'C:/shot-a-1.jpg', project_id: projectA }) || 0
    photoA2 = dbAdapter.insert('photos', { filename: 'a-2.jpg', filepath: 'C:/shot-a-2.jpg', project_id: projectA }) || 0
  }

  it('migrates legacy chapter names into the unfiled lane and keeps them editable', async () => {
    await setupDatabase()
    addProjectSelection(projectA, photoA1)
    addProjectSelection(projectA, photoA2)
    updateProjectSelectionMeta(projectA, photoA1, '人像 · 站姿', '参考肩线和手部位置')
    updateProjectSelectionMeta(projectA, photoA2, '灯光', '')

    // v5 自由分组名不属于五景别，生成后统一落到「待归类」轨道
    const generated = createShotsFromSelections(projectA)
    expect(generated.map(shot => shot.chapter)).toEqual([SHOT_LANE_UNFILED, SHOT_LANE_UNFILED])
    expect(generated[0].photo.filename).toBe('a-1.jpg')

    // 拖入景别轨道（等价于 update chapter）
    const updated = updateProjectShot(projectA, generated[0].id, {
      chapter: '近景',
      title: '站姿半身 · 窗边光',
      intent: '保持肩线自然',
      compositionNotes: '中近景，留出视线方向',
      lightingGearNotes: '大号柔光箱，银色反光板',
      status: 'ready'
    })
    expect(updated).toMatchObject({ chapter: '近景', title: '站姿半身 · 窗边光', status: 'ready' })
    expect(updated.composition_notes).toContain('中近景')

    const lanes = listShotsByLane(projectA)
    expect(lanes.map(entry => entry.lane)).toEqual([...SHOT_LANES, SHOT_LANE_UNFILED])
    expect(lanes.find(entry => entry.lane === '近景')?.shots).toHaveLength(1)
    expect(lanes.find(entry => entry.lane === SHOT_LANE_UNFILED)?.shots).toHaveLength(1)
  })

  it('keeps reference relations project-scoped and cleans them on permanent photo removal', async () => {
    await setupDatabase()
    expect(() => createProjectShot(projectB, photoA1)).toThrow('不属于当前项目')
    addProjectSelection(projectA, photoA1)
    createShotsFromSelections(projectA)
    dbAdapter.run('UPDATE photos SET deleted_at = ? WHERE id = ?', [1700000000, photoA1])
    expect(listProjectShots(projectA)).toHaveLength(1)
    removeShotsForPhotos([photoA1])
    expect(listProjectShots(projectA)).toHaveLength(0)
  })

  it('copies a single shot across projects and keeps the source untouched', async () => {
    await setupDatabase()
    const shot = createProjectShot(projectA, photoA1, { chapter: '特写', title: '眼神特写', compositionNotes: '虹膜对焦' })

    const copy = copyProjectShot(shot.id, projectB)
    expect(copy).toMatchObject({ project_id: projectB, chapter: '特写', title: '眼神特写', photo_id: photoA1 })
    // 源项目镜头保留
    expect(listProjectShots(projectA)).toHaveLength(1)
    expect(listProjectShots(projectB)).toHaveLength(1)

    // 重复复制到同项目同轨道被拦截
    expect(() => copyProjectShot(shot.id, projectB)).toThrow('已包含')

    // 指定其他景别可再复制一份
    const second = copyProjectShot(shot.id, projectB, { lane: '远景' })
    expect(second.chapter).toBe('远景')

    // 同项目内复制被拒绝
    expect(() => copyProjectShot(shot.id, projectA)).toThrow('相同')
  })

  it('always exposes the five fixed lanes and supports reordering inside a lane', async () => {
    await setupDatabase()
    // 旧数据残留分组名（如空分组）会被迁移收敛，五条景别轨道始终存在
    const empty = createShotGroup(projectA, { name: '空分组' })
    const first = createProjectShot(projectA, photoA1, { chapter: '远景' })
    const second = createProjectShot(projectA, photoA2, { chapter: '远景' })
    expect(first.chapter).toBe('远景')
    expect(second.chapter).toBe('远景')

    const groups = listShotGroups(projectA).map(group => group.name)
    expect(groups).toEqual([...SHOT_LANES, SHOT_LANE_UNFILED])
    expect(groups).not.toContain('空分组')

    // 同一轨道内 reorder
    reorderProjectShots(projectA, [second.id, first.id])
    const farLane = listShotsByLane(projectA).find(entry => entry.lane === '远景')
    expect(farLane?.shots.map(shot => shot.id)).toEqual([second.id, first.id])

    // 跨轨道移动：改 chapter 后条目离开原轨道
    updateProjectShot(projectA, second.id, { chapter: '特写', title: second.title, intent: second.intent, compositionNotes: second.composition_notes, lightingGearNotes: second.lighting_gear_notes, status: second.status })
    expect(listShotsByLane(projectA).find(entry => entry.lane === '远景')?.shots.map(shot => shot.id)).toEqual([first.id])
    expect(listShotsByLane(projectA).find(entry => entry.lane === '特写')?.shots.map(shot => shot.id)).toEqual([second.id])
    void empty
  })
})
