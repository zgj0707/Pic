import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'
import {
  addProjectMaterialReference,
  copyProjectMaterialReferences,
  exportProjectMaterialReferences,
  listProjectMaterialReferences,
  moveProjectMaterialReferences,
  removeProjectMaterialReference
} from '../../electron/services/projectReferences'

describe('project material references', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  async function setup(): Promise<{ projectId: number; otherProjectId: number }> {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-project-references-'))
    await initializeDatabase(tempDir)
    const projectId = dbAdapter.insert('projects', { name: '参考项目' })
    const otherProjectId = dbAdapter.insert('projects', { name: '接收项目' })
    if (!projectId || !otherProjectId) throw new Error('test project setup failed')
    return { projectId, otherProjectId }
  }

  it('adds, deduplicates, lists and removes a remote reference without a photo row', async () => {
    const { projectId } = await setup()
    const input = {
      projectId,
      source: 'douyin' as const,
      sourceItemId: 'item-123',
      title: '抖音参考',
      author: '作者',
      originalUrl: 'https://www.douyin.com/video/123'
    }

    const first = addProjectMaterialReference(input)
    expect(first.alreadyExists).toBe(false)
    expect(first.reference.source_type).toBe('douyin')
    expect(first.reference.original_url).toContain('douyin.com')

    const second = addProjectMaterialReference(input)
    expect(second.alreadyExists).toBe(true)
    expect(second.reference.id).toBe(first.reference.id)
    expect(listProjectMaterialReferences(projectId)).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM photos WHERE project_id = ?', [projectId])).toHaveLength(0)

    expect(removeProjectMaterialReference(projectId, first.reference.id)).toBe(true)
    expect(listProjectMaterialReferences(projectId)).toHaveLength(0)
  })

  it('moves references on project deletion and deduplicates at the destination', async () => {
    const { projectId, otherProjectId } = await setup()
    addProjectMaterialReference({
      projectId,
      source: 'douyin',
      sourceItemId: 'same-item',
      title: '来源项目',
      originalUrl: 'https://www.douyin.com/video/same'
    })
    addProjectMaterialReference({
      projectId: otherProjectId,
      source: 'douyin',
      sourceItemId: 'same-item',
      title: '目标项目已有',
      originalUrl: 'https://www.douyin.com/video/same'
    })
    moveProjectMaterialReferences(projectId, otherProjectId)
    expect(listProjectMaterialReferences(projectId)).toHaveLength(0)
    expect(listProjectMaterialReferences(otherProjectId)).toHaveLength(1)
    expect(listProjectMaterialReferences(otherProjectId)[0].title).toBe('目标项目已有')
  })

  it('copies references between projects without creating photo rows', async () => {
    const { projectId, otherProjectId } = await setup()
    addProjectMaterialReference({
      projectId,
      source: 'xiaohongshu',
      sourceItemId: 'copy-item',
      title: '复制的参考',
      originalUrl: 'https://www.xiaohongshu.com/explore/copy-item'
    })
    copyProjectMaterialReferences(projectId, otherProjectId)
    expect(listProjectMaterialReferences(otherProjectId)).toHaveLength(1)
    expect(listProjectMaterialReferences(otherProjectId)[0].title).toBe('复制的参考')
    expect(dbAdapter.query('SELECT id FROM photos WHERE project_id = ?', [otherProjectId])).toHaveLength(0)
  })

  it('exports references as a safe HTML link list without downloading media', async () => {
    const { projectId } = await setup()
    addProjectMaterialReference({
      projectId,
      source: 'douyin',
      sourceItemId: 'export-item',
      title: '<脚本>参考',
      originalUrl: 'https://www.douyin.com/video/export-item'
    })
    const desktopPath = join(tempDir, 'Desktop')
    const result = exportProjectMaterialReferences(projectId, '项目:参考', desktopPath)
    expect(result).toMatchObject({ success: true, exported: 1, failed: 0 })
    expect(result.filePath).toContain('项目-参考')
    const html = (await import('fs')).readFileSync(result.filePath!, 'utf8')
    expect(html).toContain('&lt;脚本&gt;参考')
    expect(html).toContain('https://www.douyin.com/video/export-item')
    expect(html).not.toContain('<脚本>参考')
  })
})
