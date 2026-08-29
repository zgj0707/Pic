import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'
import { deleteProjectAndMoveContents, duplicateProject, movePhotosToProject } from '../../electron/services/projectManagement'
import { addProjectMaterialReference } from '../../electron/services/projectReferences'

describe('project copy and delete management', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('copies the shoot brief without duplicating photo files and moves contents safely when deleting', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-project-management-'))
    await initializeDatabase(tempDir)
    const sourceId = dbAdapter.insert('projects', {
      name: '品牌秋季拍摄',
      description: '暖调自然光',
      client_name: 'North Studio',
      shoot_date: '2026-09-18',
      location: '河畔旧厂房',
      owner: '林卓',
      deliverable_goal: '12 张主视觉',
      created_at: 1700000000,
      updated_at: 1700000000
    })!
    const photoId = dbAdapter.insert('photos', {
      filename: 'reference.jpg',
      filepath: 'C:/fixtures/reference.jpg',
      project_id: sourceId,
      imported_at: 1700000000
    })!
    dbAdapter.run('UPDATE projects SET cover_photo_id = ? WHERE id = ?', [photoId, sourceId])
    dbAdapter.insert('project_selections', {
      project_id: sourceId,
      photo_id: photoId,
      position: 0,
      chapter: '光线',
      note: '保留侧逆光',
      created_at: 1700000000
    })
    dbAdapter.insert('project_shots', {
      project_id: sourceId,
      photo_id: photoId,
      position: 0,
      chapter: '光线',
      title: '主视觉',
      status: 'planned',
      created_at: 1700000000,
      updated_at: 1700000000
    })
    dbAdapter.insert('project_exports', {
      project_id: sourceId,
      kind: 'reference-package',
      target_path: 'C:/exports/reference',
      item_count: 1,
      created_at: 1700000000
    })
    addProjectMaterialReference({
      projectId: sourceId,
      source: 'douyin',
      sourceItemId: 'https://www.douyin.com/video/123',
      title: '抖音灵感',
      originalUrl: 'https://www.douyin.com/video/123'
    })

    const firstCopy = duplicateProject(sourceId)
    const secondCopy = duplicateProject(sourceId)
    expect(firstCopy).toMatchObject({ success: true, name: '品牌秋季拍摄 副本' })
    expect(secondCopy).toMatchObject({ success: true, name: '品牌秋季拍摄 副本 (2)' })
    const copied = dbAdapter.get('SELECT * FROM projects WHERE id = ?', [firstCopy.id])
    expect(copied).toMatchObject({
      description: '暖调自然光',
      client_name: 'North Studio',
      shoot_date: '2026-09-18',
      location: '河畔旧厂房',
      owner: '林卓',
      deliverable_goal: '12 张主视觉',
      cover_photo_id: null
    })
    expect(dbAdapter.get('SELECT COUNT(*) AS count FROM photos WHERE project_id = ?', [firstCopy.id])?.count).toBe(0)
    expect(dbAdapter.get('SELECT COUNT(*) AS count FROM photos')?.count).toBe(1)
    expect(dbAdapter.get('SELECT COUNT(*) AS count FROM project_material_references WHERE project_id = ?', [firstCopy.id])?.count).toBe(1)

    const deleted = deleteProjectAndMoveContents(sourceId)
    expect(deleted.success).toBe(true)
    expect(deleted.movedPhotos).toBe(1)
    expect(dbAdapter.get('SELECT id FROM projects WHERE id = ?', [sourceId])).toBeNull()
    expect(dbAdapter.get('SELECT project_id FROM photos WHERE id = ?', [photoId])?.project_id).toBe(deleted.targetProjectId)
    expect(dbAdapter.get('SELECT project_id FROM project_selections WHERE photo_id = ?', [photoId])?.project_id).toBe(deleted.targetProjectId)
    expect(dbAdapter.get('SELECT project_id FROM project_shots WHERE photo_id = ?', [photoId])?.project_id).toBe(deleted.targetProjectId)
    expect(dbAdapter.get('SELECT project_id FROM project_exports WHERE target_path = ?', ['C:/exports/reference'])?.project_id).toBe(deleted.targetProjectId)
    expect(dbAdapter.get('SELECT project_id FROM project_material_references WHERE project_id = ? AND source_item_id = ?', [deleted.targetProjectId, 'https://www.douyin.com/video/123'])?.project_id).toBe(deleted.targetProjectId)
  })

  it('creates a fallback project when deleting the only project', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-project-last-delete-'))
    await initializeDatabase(tempDir)
    dbAdapter.run('DELETE FROM projects')
    const sourceId = dbAdapter.insert('projects', {
      name: '唯一项目',
      created_at: 1700000000,
      updated_at: 1700000000
    })!
    const photoId = dbAdapter.insert('photos', {
      filename: 'only.jpg',
      filepath: 'C:/fixtures/only.jpg',
      project_id: sourceId,
      imported_at: 1700000000
    })!

    const result = deleteProjectAndMoveContents(sourceId)
    expect(result).toMatchObject({ success: true, targetProjectName: '未分类项目', movedPhotos: 1 })
    expect(result.targetProjectId).not.toBe(sourceId)
    expect(dbAdapter.get('SELECT project_id FROM photos WHERE id = ?', [photoId])?.project_id).toBe(result.targetProjectId)
    expect(dbAdapter.query('SELECT id FROM projects')).toHaveLength(1)
  })

  it('moves selected photos across projects and preserves related project records', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-project-photo-move-'))
    await initializeDatabase(tempDir)
    const sourceId = dbAdapter.insert('projects', {
      name: '来源项目',
      created_at: 1700000000,
      updated_at: 1700000000
    })!
    const targetId = dbAdapter.insert('projects', {
      name: '目标项目',
      created_at: 1700000000,
      updated_at: 1700000000
    })!
    const movedPhotoId = dbAdapter.insert('photos', {
      filename: 'move.jpg',
      filepath: 'C:/fixtures/move.jpg',
      project_id: sourceId,
      imported_at: 1700000000
    })!
    const untouchedPhotoId = dbAdapter.insert('photos', {
      filename: 'stay.jpg',
      filepath: 'C:/fixtures/stay.jpg',
      project_id: sourceId,
      imported_at: 1700000000
    })!
    const duplicatePhotoId = dbAdapter.insert('photos', {
      filename: 'duplicate.jpg',
      filepath: 'C:/fixtures/duplicate.jpg',
      project_id: targetId,
      imported_at: 1700000000
    })!
    dbAdapter.run('UPDATE projects SET cover_photo_id = ? WHERE id = ?', [movedPhotoId, sourceId])
    dbAdapter.insert('project_selections', {
      project_id: sourceId,
      photo_id: movedPhotoId,
      position: 2,
      chapter: '构图',
      note: '保留留白',
      created_at: 1700000000
    })
    dbAdapter.insert('project_shots', {
      project_id: sourceId,
      photo_id: movedPhotoId,
      position: 1,
      chapter: '构图',
      title: '留白主视觉',
      status: 'ready',
      created_at: 1700000000,
      updated_at: 1700000000
    })
    dbAdapter.insert('project_selections', {
      project_id: targetId,
      photo_id: duplicatePhotoId,
      position: 0,
      created_at: 1700000000
    })

    const result = movePhotosToProject(sourceId, targetId, [movedPhotoId, untouchedPhotoId, duplicatePhotoId])

    expect(result).toMatchObject({
      success: true,
      movedPhotoIds: [movedPhotoId, untouchedPhotoId],
      skippedPhotoIds: [duplicatePhotoId],
      movedPhotos: 2,
      skippedPhotos: 1
    })
    expect(dbAdapter.get('SELECT project_id FROM photos WHERE id = ?', [movedPhotoId])?.project_id).toBe(targetId)
    expect(dbAdapter.get('SELECT project_id FROM photos WHERE id = ?', [untouchedPhotoId])?.project_id).toBe(targetId)
    expect(dbAdapter.get('SELECT project_id FROM project_selections WHERE photo_id = ?', [movedPhotoId])?.project_id).toBe(targetId)
    expect(dbAdapter.get('SELECT project_id, chapter, note FROM project_selections WHERE photo_id = ?', [movedPhotoId])).toMatchObject({
      project_id: targetId,
      chapter: '构图',
      note: '保留留白'
    })
    expect(dbAdapter.get('SELECT project_id, title, status FROM project_shots WHERE photo_id = ?', [movedPhotoId])).toMatchObject({
      project_id: targetId,
      title: '留白主视觉',
      status: 'ready'
    })
    expect(dbAdapter.get('SELECT cover_photo_id FROM projects WHERE id = ?', [sourceId])?.cover_photo_id).toBeNull()
  })
})
