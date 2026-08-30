import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { addProjectSelection, updateProjectSelectionMeta } from '../../electron/services/projectSelections'
import {
  createProjectShot,
  createShotsFromSelections,
  listProjectShots,
  removeProjectShot,
  removeShotsForPhotos,
  reorderProjectShots,
  updateProjectShot
} from '../../electron/services/projectShots'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'

describe('project shot list', () => {
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

  it('persists board chapters and generates editable shots in board order', async () => {
    await setupDatabase()
    addProjectSelection(projectA, photoA1)
    addProjectSelection(projectA, photoA2)
    const meta = updateProjectSelectionMeta(projectA, photoA1, '人像 · 站姿', '参考肩线和手部位置')
    expect(meta.chapter).toBe('人像 · 站姿')
    expect(meta.note).toBe('参考肩线和手部位置')
    const secondMeta = updateProjectSelectionMeta(projectA, photoA2, '灯光', '')
    expect(secondMeta.chapter).toBe('灯光')

    const generated = createShotsFromSelections(projectA)
    expect(generated.map(shot => shot.photo_id)).toEqual([photoA1, photoA2])
    expect(generated.map(shot => shot.chapter)).toEqual(['人像 · 站姿', '灯光'])
    expect(generated[0].photo.filename).toBe('a-1.jpg')

    const updated = updateProjectShot(projectA, generated[0].id, {
      chapter: '窗边自然光',
      title: '站姿半身 · 窗边光',
      intent: '保持肩线自然',
      compositionNotes: '中近景，留出视线方向',
      lightingGearNotes: '大号柔光箱，银色反光板',
      status: 'ready'
    })
    expect(updated).toMatchObject({ chapter: '窗边自然光', title: '站姿半身 · 窗边光', intent: '保持肩线自然', status: 'ready' })
    expect(updated.composition_notes).toContain('中近景')
    expect(updated.lighting_gear_notes).toContain('柔光箱')

    const shots = listProjectShots(projectA)
    reorderProjectShots(projectA, [shots[1].id, shots[0].id])
    expect(listProjectShots(projectA).map(shot => shot.id)).toEqual([shots[1].id, shots[0].id])
    expect(removeProjectShot(projectA, shots[1].id)).toBe(true)
    expect(listProjectShots(projectA)).toHaveLength(1)
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
})
