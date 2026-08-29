import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  addProjectSelection,
  listProjectSelections,
  removeProjectSelection,
  removeSelectionsForPhotos,
  reorderProjectSelections
} from '../../electron/services/projectSelections'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'

describe('project selections', () => {
  let tempDir = ''
  let projectA = 0
  let projectB = 0
  let photoA1 = 0
  let photoA2 = 0
  let photoB1 = 0

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  async function setupDatabase() {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-project-selections-'))
    mkdirSync(join(tempDir, 'database'), { recursive: true })
    await initializeDatabase(tempDir)
    projectA = dbAdapter.insert('projects', { name: '项目 A', description: null }) || 0
    projectB = dbAdapter.insert('projects', { name: '项目 B', description: null }) || 0
    photoA1 = dbAdapter.insert('photos', { filename: 'a-1.jpg', filepath: 'C:/a-1.jpg', project_id: projectA }) || 0
    photoA2 = dbAdapter.insert('photos', { filename: 'a-2.jpg', filepath: 'C:/a-2.jpg', project_id: projectA }) || 0
    photoB1 = dbAdapter.insert('photos', { filename: 'b-1.jpg', filepath: 'C:/b-1.jpg', project_id: projectB }) || 0
  }

  it('adds, deduplicates, removes, reorders, persists, and isolates selections by project', async () => {
    await setupDatabase()

    const first = addProjectSelection(projectA, photoA1)
    const duplicate = addProjectSelection(projectA, photoA1)
    addProjectSelection(projectA, photoA2)

    expect(duplicate.id).toBe(first.id)
    expect(listProjectSelections(projectA).map(selection => selection.photo_id)).toEqual([photoA1, photoA2])
    expect(() => addProjectSelection(projectA, photoB1)).toThrow('不属于当前项目')

    reorderProjectSelections(projectA, [photoA2, photoA1])
    expect(listProjectSelections(projectA).map(selection => selection.photo_id)).toEqual([photoA2, photoA1])

    addProjectSelection(projectB, photoB1)
    expect(listProjectSelections(projectB).map(selection => selection.photo_id)).toEqual([photoB1])
    expect(listProjectSelections(projectA).map(selection => selection.photo_id)).toEqual([photoA2, photoA1])

    expect(removeProjectSelection(projectA, photoA2)).toBe(true)
    expect(removeProjectSelection(projectA, photoA2)).toBe(false)
    expect(listProjectSelections(projectA).map(selection => selection.photo_id)).toEqual([photoA1])

    closeDatabase()
    await initializeDatabase(tempDir)
    expect(listProjectSelections(projectB).map(selection => selection.photo_id)).toEqual([photoB1])
  })

  it('keeps soft-deleted selections recoverable and removes permanent-deletion relations', async () => {
    await setupDatabase()
    addProjectSelection(projectA, photoA1)

    dbAdapter.run('UPDATE photos SET deleted_at = ? WHERE id = ?', [1700000000, photoA1])
    expect(listProjectSelections(projectA).map(selection => selection.photo_id)).toEqual([photoA1])

    dbAdapter.run('UPDATE photos SET deleted_at = NULL WHERE id = ?', [photoA1])
    removeSelectionsForPhotos([photoA1])
    expect(listProjectSelections(projectA)).toHaveLength(0)
  })
})