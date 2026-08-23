import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { exportProjectDelivery } from '../../electron/services/delivery'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'

describe('project delivery export', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('copies in selection order, reports partial failures, and records delivered_at', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-delivery-'))
    mkdirSync(join(tempDir, 'database'), { recursive: true })
    const sourceA = join(tempDir, 'source-a.jpg')
    const missing = join(tempDir, 'missing.jpg')
    const target = join(tempDir, 'exports')
    mkdirSync(target, { recursive: true })
    writeFileSync(sourceA, 'source-a')
    await initializeDatabase(tempDir)
    const projectId = dbAdapter.insert('projects', { name: '交付项目', description: null }) || 0
    const photoA = dbAdapter.insert('photos', { filename: '原图-a.jpg', filepath: sourceA, project_id: projectId }) || 0
    const missingPhoto = dbAdapter.insert('photos', { filename: '缺失-b.jpg', filepath: missing, project_id: projectId }) || 0

    const result = exportProjectDelivery(projectId, [photoA, missingPhoto], target, '客户交付', 'CLIENT-')

    expect(result.success).toBe(false)
    expect(result.copied).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.results[0].targetPath.endsWith('CLIENT-001.jpg')).toBe(true)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].error).toBe('原图文件不存在')
    expect(readFileSync(result.results[0].targetPath, 'utf8')).toBe('source-a')
    expect(readFileSync(sourceA, 'utf8')).toBe('source-a')
    expect(dbAdapter.get('SELECT delivered_at FROM photos WHERE id = ?', [photoA])?.delivered_at).toBeTypeOf('number')
    expect(dbAdapter.get('SELECT delivered_at FROM photos WHERE id = ?', [missingPhoto])?.delivered_at).toBeNull()
  })
})