import { afterEach, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, dbAdapter, initializeDatabase } from '../../electron/services/database'

describe('legacy project database migration', () => {
  let tempDir = ''

  afterEach(() => {
    closeDatabase()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('adds project timestamps and allows creating a project', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-legacy-project-db-'))
    const databaseDir = join(tempDir, 'database')
    mkdirSync(databaseDir, { recursive: true })

    const SQL = await initSqlJs({
      locateFile: file => join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    })
    const legacyDb = new SQL.Database()
    legacyDb.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        date INTEGER,
        album_id INTEGER
      );
      INSERT INTO projects (name, description, date)
      VALUES ('旧项目', '迁移测试', 1700000000);
    `)
    writeFileSync(join(databaseDir, 'gallery.db'), Buffer.from(legacyDb.export()))
    legacyDb.close()

    await initializeDatabase(tempDir)

    const columnNames = dbAdapter
      .query('PRAGMA table_info(projects)')
      .map(column => column.name)
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')

    const existing = dbAdapter.get('SELECT created_at, updated_at FROM projects WHERE name = ?', ['旧项目'])
    expect(existing?.created_at).toBe(1700000000)
    expect(existing?.updated_at).toBe(1700000000)

    const now = Math.floor(Date.now() / 1000)
    const id = dbAdapter.insert('projects', {
      name: '新项目',
      description: null,
      created_at: now,
      updated_at: now
    })
    expect(id).toBeGreaterThan(0)
  })

  it('adds review_state to legacy photos and keeps the migration idempotent', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-legacy-photo-db-'))
    const databaseDir = join(tempDir, 'database')
    mkdirSync(databaseDir, { recursive: true })

    const SQL = await initSqlJs({
      locateFile: file => join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    })
    const legacyDb = new SQL.Database()
    legacyDb.exec(`
      CREATE TABLE photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL UNIQUE,
        filesize INTEGER,
        width INTEGER,
        height INTEGER,
        created_at INTEGER,
        imported_at INTEGER,
        rating INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        thumbnail_path TEXT,
        exif_json TEXT,
        deleted_at INTEGER,
        project_id INTEGER,
        original_filepath TEXT
      );
      INSERT INTO photos (filename, filepath, imported_at) VALUES ('旧照片.jpg', 'C:/旧照片.jpg', 1700000000);
    `)
    writeFileSync(join(databaseDir, 'gallery.db'), Buffer.from(legacyDb.export()))
    legacyDb.close()

    await initializeDatabase(tempDir)

    const columns = dbAdapter.query('PRAGMA table_info(photos)').map(column => column.name)
    expect(columns.filter(column => column === 'review_state')).toHaveLength(1)
    expect(dbAdapter.get('SELECT review_state FROM photos WHERE id = 1')?.review_state).toBe('unreviewed')

    dbAdapter.run('UPDATE photos SET review_state = ? WHERE id = ?', ['pick', 1])
    expect(dbAdapter.get('SELECT review_state FROM photos WHERE id = 1')?.review_state).toBe('pick')

    closeDatabase()
    await initializeDatabase(tempDir)
    expect(dbAdapter.query('PRAGMA table_info(photos)').filter(column => column.name === 'review_state')).toHaveLength(1)
  })
})
