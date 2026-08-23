import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { importPhotoToDatabase } from '../../electron/ipc/import'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'

describe('reference sample source metadata', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('records web source URL/domain and keeps local imports distinguishable', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-source-import-'))
    mkdirSync(join(tempDir, 'database'), { recursive: true })
    await initializeDatabase(tempDir)

    const projectId = dbAdapter.insert('projects', { name: '来源测试项目', description: null }) || 0
    const webFile = join(tempDir, 'web-reference.jpg')
    const localFile = join(tempDir, 'local-reference.jpg')
    writeFileSync(webFile, 'web sample')
    writeFileSync(localFile, 'local sample')

    const webPhoto = await importPhotoToDatabase(webFile, projectId, {
      type: 'web',
      url: 'https://example.com/inspiration/42',
      note: '构图参考'
    })
    const localPhoto = await importPhotoToDatabase(localFile, projectId, { type: 'local' })

    expect(webPhoto?.id).toBeGreaterThan(0)
    expect(localPhoto?.id).toBeGreaterThan(0)
    const webRow = dbAdapter.get('SELECT source_url, source_domain, source_type, source_note, project_id FROM photos WHERE id = ?', [webPhoto?.id])
    const localRow = dbAdapter.get('SELECT source_url, source_domain, source_type, source_note, project_id FROM photos WHERE id = ?', [localPhoto?.id])
    expect(webRow).toMatchObject({
      source_url: 'https://example.com/inspiration/42',
      source_domain: 'example.com',
      source_type: 'web',
      source_note: '构图参考',
      project_id: projectId
    })
    expect(localRow).toMatchObject({ source_url: null, source_domain: null, source_type: 'local', source_note: null, project_id: projectId })
  })
})