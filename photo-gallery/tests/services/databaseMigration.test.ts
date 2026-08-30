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
    expect(columnNames).toEqual(expect.arrayContaining([
      'client_name', 'shoot_date', 'location', 'owner', 'deliverable_goal', 'cover_photo_id'
    ]))

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
    expect(columns.filter(column => column === 'delivered_at')).toHaveLength(1)
    expect(columns.filter(column => column === 'source_url')).toHaveLength(1)
    expect(columns.filter(column => column === 'source_domain')).toHaveLength(1)
    expect(columns.filter(column => column === 'source_type')).toHaveLength(1)
    expect(columns.filter(column => column === 'source_note')).toHaveLength(1)
    expect(dbAdapter.get('SELECT review_state, delivered_at FROM photos WHERE id = 1')?.review_state).toBe('unreviewed')
    expect(dbAdapter.get('SELECT review_state, delivered_at FROM photos WHERE id = 1')?.delivered_at).toBeNull()
    expect(dbAdapter.get('SELECT source_type FROM photos WHERE id = 1')?.source_type).toBe('local')

    dbAdapter.run('UPDATE photos SET review_state = ? WHERE id = ?', ['pick', 1])
    expect(dbAdapter.get('SELECT review_state FROM photos WHERE id = 1')?.review_state).toBe('pick')

    closeDatabase()
    await initializeDatabase(tempDir)
    expect(dbAdapter.query('PRAGMA table_info(photos)').filter(column => column.name === 'review_state')).toHaveLength(1)
  })
  it('adds inspiration-board metadata and creates the independent shot list table', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pic-legacy-board-db-'))
    const databaseDir = join(tempDir, 'database')
    mkdirSync(databaseDir, { recursive: true })

    const SQL = await initSqlJs({
      locateFile: file => join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    })
    const legacyDb = new SQL.Database()
    legacyDb.exec(`
      CREATE TABLE project_selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        photo_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER
      );
      INSERT INTO project_selections (project_id, photo_id, position) VALUES (1, 2, 0);
      CREATE TABLE project_shots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        photo_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        intent TEXT,
        composition_notes TEXT,
        lighting_gear_notes TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        created_at INTEGER,
        updated_at INTEGER
      );
      INSERT INTO project_shots (project_id, photo_id, position, title, status, created_at, updated_at)
        VALUES (1, 2, 0, '旧拍摄条目', 'planned', 1700000000, 1700000000);
    `)
    writeFileSync(join(databaseDir, 'gallery.db'), Buffer.from(legacyDb.export()))
    legacyDb.close()

    await initializeDatabase(tempDir)

    const selectionColumns = dbAdapter.query('PRAGMA table_info(project_selections)').map(column => column.name)
    expect(selectionColumns).toContain('chapter')
    expect(selectionColumns).toContain('note')
    const shotColumns = dbAdapter.query('PRAGMA table_info(project_shots)').map(column => column.name)
    expect(shotColumns).toContain('chapter')
    expect(dbAdapter.get('SELECT chapter, note FROM project_selections WHERE id = 1')).toMatchObject({ chapter: '未分组', note: null })
    expect(dbAdapter.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_shots'")).toHaveLength(1)
    expect(dbAdapter.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_material_references'")).toHaveLength(1)
    expect(dbAdapter.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shot_groups'")).toHaveLength(1)
    expect(dbAdapter.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plan_references'")).toHaveLength(1)
    expect(dbAdapter.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shot_items'")).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM shot_groups')).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM plan_references')).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM shot_items')).toHaveLength(1)

    closeDatabase()
    await initializeDatabase(tempDir)
    expect(dbAdapter.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_material_references'")).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM shot_groups')).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM plan_references')).toHaveLength(1)
    expect(dbAdapter.query('SELECT id FROM shot_items')).toHaveLength(1)
  })
})
