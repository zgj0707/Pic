import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'
import { listProjectExports, recordProjectExport } from '../../electron/services/planningExports'

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