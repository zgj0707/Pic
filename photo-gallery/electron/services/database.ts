import initSqlJs from 'sql.js'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

let db: any = null
let dbPath: string = ''
let SQL: any = null

// ─── 延迟保存（dirty flag + debounce）───
// 高频写操作（run/exec/insert）只标记 dirty，由定时器批量落盘一次，
// 避免每次写操作都全量序列化。退出时由 saveDatabase() 强制同步落盘。
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 500

function markDirty(): void {
  dirty = true
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    flushIfDirty()
  }, SAVE_DEBOUNCE_MS)
}

function flushIfDirty(): void {
  if (!dirty) return
  dirty = false
  saveDatabase()
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL UNIQUE,
  filesize INTEGER,
  width INTEGER,
  height INTEGER,
  created_at INTEGER,
  imported_at INTEGER DEFAULT (strftime('%s', 'now')),
  rating INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0,
  thumbnail_path TEXT,
  exif_json TEXT,
  deleted_at INTEGER,
  project_id INTEGER,
  original_filepath TEXT,
  review_state TEXT NOT NULL DEFAULT 'unreviewed',
  delivered_at INTEGER,
  source_url TEXT,
  source_domain TEXT,
  source_type TEXT NOT NULL DEFAULT 'local',
  source_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating);
CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos(is_favorite);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photos_imported ON photos(imported_at);

CREATE TABLE IF NOT EXISTS project_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  photo_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE (project_id, photo_id)
);
CREATE INDEX IF NOT EXISTS idx_project_selections_project_position ON project_selections(project_id, position);
CREATE TABLE IF NOT EXISTS project_shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  photo_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  chapter TEXT NOT NULL DEFAULT '未分组',
  title TEXT NOT NULL,
  intent TEXT,
  composition_notes TEXT,
  lighting_gear_notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE (project_id, photo_id)
);
CREATE INDEX IF NOT EXISTS idx_project_shots_project_position ON project_shots(project_id, position);
CREATE INDEX IF NOT EXISTS idx_project_shots_photo ON project_shots(photo_id);
CREATE TABLE IF NOT EXISTS project_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  target_path TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_project_exports_project_created ON project_exports(project_id, created_at);


CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS photo_albums (
  photo_id INTEGER,
  album_id INTEGER,
  PRIMARY KEY (photo_id, album_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (photo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS import_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT,
  imported_count INTEGER,
  imported_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

INSERT OR IGNORE INTO albums (id, name, description) VALUES (1, '所有照片', '自动创建的默认相册');
`

/**
 * A single row from a SQL query, mapped as column name → value.
 * Uses `any` because SQL is dynamically typed — the caller is
 * responsible for casting to the expected domain type (Photo, Tag, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>

/** Result of a run/insert operation */
interface RunResult {
  changes: number
  lastInsertRowid: number
}

/**
 * The database adapter provides a simplified interface over sql.js.
 * All write operations (run, exec, insert) automatically persist
 * the database to disk — callers do not need to call saveDatabase()
 * separately.
 */
export interface DbAdapter {
  /** Execute a SELECT query and return all matching rows. */
  query: (sql: string, params?: unknown[]) => DbRow[]
  /** Execute a SELECT query and return the first matching row, or null. */
  get: (sql: string, params?: unknown[]) => DbRow | null
  /** Execute an INSERT/UPDATE/DELETE and return the affected row count + last ID. */
  run: (sql: string, params?: unknown[]) => RunResult
  /** Execute raw SQL (e.g. CREATE TABLE) and persist. */
  exec: (sql: string) => void
  /** Insert a row into a table from a key-value object. Returns the new row ID, or null on failure. */
  insert: (table: string, data: Record<string, unknown>) => number | null
}

export function getDatabase(): any {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export async function initializeDatabase(appDataPath: string): Promise<void> {
  const dbDir = join(appDataPath, 'database')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  dbPath = join(dbDir, 'gallery.db')
  SQL = await initSqlJs({
    locateFile: (file: string) => {
      // Resolve sql.js wasm robustly regardless of where the module is bundled.
      // Priority: bundled node_modules (dev/asar) → external app.asar.unpacked → resources.
      const candidates = [
        join(__dirname, '../../node_modules/sql.js/dist', file),
        join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules/sql.js/dist', file),
        join(process.resourcesPath || '', 'node_modules/sql.js/dist', file)
      ]
      const { existsSync } = require('fs')
      const found = candidates.find(c => existsSync(c))
      if (found) return found
      return candidates[0]
    }
  })

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Ensure the base table exists before running migrations. For an existing
  // database this is a no-op; the ALTER statements below add missing columns.
  // Create the full table before running migrations. This is a no-op for existing databases.
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL UNIQUE,
      filesize INTEGER,
      width INTEGER,
      height INTEGER,
      created_at INTEGER,
      imported_at INTEGER DEFAULT (strftime('%s', 'now')),
      rating INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      thumbnail_path TEXT,
      exif_json TEXT,
      deleted_at INTEGER,
      project_id INTEGER,
      original_filepath TEXT,
      review_state TEXT NOT NULL DEFAULT 'unreviewed',
      delivered_at INTEGER,
      source_url TEXT,
      source_domain TEXT,
      source_type TEXT NOT NULL DEFAULT 'local',
      source_note TEXT
    )
  `)
  try {
    db.exec('ALTER TABLE photos ADD COLUMN deleted_at INTEGER')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('duplicate column name')) {
      console.error('[database] Migration failed:', error)
    }
  }

  // 迁移：为旧表添加 project_id 列
  try {
    db.exec('ALTER TABLE photos ADD COLUMN project_id INTEGER')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('duplicate column name')) {
      console.error('[database] project_id migration failed:', error)
    }
  }

  // Migration: preserve the original location of files moved to the recycle bin.
  try {
    db.exec('ALTER TABLE photos ADD COLUMN original_filepath TEXT')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('duplicate column name')) {
      console.error('[database] original_filepath migration failed:', error)
    }
  }
  // Migration: add the keyboard-first culling state to legacy photo tables.
  // Check PRAGMA first so the migration is idempotent.
  const photoColumns = dbAdapter.query('PRAGMA table_info(photos)')
  if (!photoColumns.some(column => column.name === 'review_state')) {
    db.exec("ALTER TABLE photos ADD COLUMN review_state TEXT NOT NULL DEFAULT 'unreviewed'")
  }

  // Migration: add delivery status without assuming a specific legacy schema.
  const deliveryColumns = dbAdapter.query('PRAGMA table_info(photos)')
  if (!deliveryColumns.some(column => column.name === 'delivered_at')) {
    db.exec('ALTER TABLE photos ADD COLUMN delivered_at INTEGER')
  }

  // Migration: keep source metadata for web-collected and local reference samples.
  const sourceColumns = dbAdapter.query('PRAGMA table_info(photos)')
  if (!sourceColumns.some(column => column.name === 'source_url')) {
    db.exec('ALTER TABLE photos ADD COLUMN source_url TEXT')
  }
  if (!sourceColumns.some(column => column.name === 'source_domain')) {
    db.exec('ALTER TABLE photos ADD COLUMN source_domain TEXT')
  }
  if (!sourceColumns.some(column => column.name === 'source_type')) {
    db.exec("ALTER TABLE photos ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local'")
  }
  if (!sourceColumns.some(column => column.name === 'source_note')) {
    db.exec('ALTER TABLE photos ADD COLUMN source_note TEXT')
  }
  dbAdapter.run("UPDATE photos SET source_type = 'local' WHERE source_type IS NULL OR source_type = ''")

  db.exec(SCHEMA)
  // Migration: keep a lightweight audit trail for planning exports.
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      target_path TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_exports_project_created ON project_exports(project_id, created_at)')
  // Migration: add chapter and note fields to legacy inspiration-board entries.
  const selectionColumns = dbAdapter.query('PRAGMA table_info(project_selections)')
  if (!selectionColumns.some(column => column.name === 'chapter')) {
    db.exec("ALTER TABLE project_selections ADD COLUMN chapter TEXT NOT NULL DEFAULT '未分组'")
  }
  if (!selectionColumns.some(column => column.name === 'note')) {
    db.exec('ALTER TABLE project_selections ADD COLUMN note TEXT')
  }
  dbAdapter.run("UPDATE project_selections SET chapter = '未分组' WHERE chapter IS NULL OR chapter = ''")

  // Migration: create the independent shot-list table for legacy installations.
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_shots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      chapter TEXT NOT NULL DEFAULT '未分组',
      title TEXT NOT NULL,
      intent TEXT,
      composition_notes TEXT,
      lighting_gear_notes TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE (project_id, photo_id)
    )
  `)
  const shotColumns = dbAdapter.query('PRAGMA table_info(project_shots)')
  if (!shotColumns.some(column => column.name === 'chapter')) {
    db.exec("ALTER TABLE project_shots ADD COLUMN chapter TEXT NOT NULL DEFAULT '未分组'")
  }
  dbAdapter.run("UPDATE project_shots SET chapter = '未分组' WHERE chapter IS NULL OR chapter = ''")
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_shots_project_position ON project_shots(project_id, position)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_project_shots_photo ON project_shots(photo_id)')

  // Migration: early project tables used client_id/date/album_id and did not
  // have the timestamps required by the current create/update handlers.
  // CREATE TABLE IF NOT EXISTS does not add columns to an existing table, so
  // older installations would fail every projects:create call with
  // "no such column: created_at".
  for (const column of ['created_at', 'updated_at']) {
    try {
      db.exec(`ALTER TABLE projects ADD COLUMN ${column} INTEGER`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('duplicate column name')) {
        console.error(`[database] projects.${column} migration failed:`, error)
      }
    }
  }

  try {
    const projectColumns = dbAdapter.query('PRAGMA table_info(projects)')
    const hasLegacyDate = projectColumns.some(column => column.name === 'date')
    const now = Math.floor(Date.now() / 1000)
    if (hasLegacyDate) {
      dbAdapter.run(
        'UPDATE projects SET created_at = COALESCE(created_at, date, ?), updated_at = COALESCE(updated_at, date, created_at, ?)',
        [now, now]
      )
    } else {
      dbAdapter.run(
        'UPDATE projects SET created_at = COALESCE(created_at, ?), updated_at = COALESCE(updated_at, created_at, ?)',
        [now, now]
      )
    }
  } catch (error) {
    console.error('[database] Project timestamp backfill failed:', error)
  }

  // 单独创建 deleted_at 索引，确保列已存在
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_photos_deleted ON photos(deleted_at)')
  } catch (error) {
    console.error('[database] Failed to create deleted_at index:', error)
  }

  // 单独创建 project_id 索引，确保列已存在
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_photos_project ON photos(project_id)')
  } catch (error) {
    console.error('[database] Failed to create project_id index:', error)
  }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_photos_review_state ON photos(review_state)')
  } catch (error) {
    console.error('[database] Failed to create review_state index:', error)
  }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_photos_source_type ON photos(source_type)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_photos_source_domain ON photos(source_domain)')
  } catch (error) {
    console.error('[database] Failed to create source indexes:', error)
  }

  // 为没有项目的旧数据创建默认项目并关联
  try {
    let defaultProject = dbAdapter.get('SELECT id FROM projects ORDER BY id ASC LIMIT 1')
    if (!defaultProject) {
      const defaultProjectId = dbAdapter.insert('projects', {
        name: '默认项目',
        description: '自动创建的默认项目'
      })
      if (defaultProjectId) {
        defaultProject = { id: defaultProjectId }
      }
    }
    if (defaultProject?.id) {
      dbAdapter.run(
        'UPDATE photos SET project_id = ? WHERE project_id IS NULL AND deleted_at IS NULL',
        [defaultProject.id]
      )
    }
  } catch (error) {
    console.error('[database] Default project migration failed:', error)
  }

  saveDatabase()
  console.log('Database initialized at', dbPath)
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
  dirty = false
}

/**
 * 强制落盘并取消挂起的定时保存。
 * 供退出流程调用，确保所有未保存的修改写盘。
 */
export function flushDatabase(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  flushIfDirty()
}

export function closeDatabase(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (db) {
    db.close()
    db = null
  }
}

export const dbAdapter: DbAdapter = {
  get: (sql: string, params: unknown[] = []): DbRow | null => {
    const stmt = getDatabase().prepare(sql)
    try {
      stmt.bind(params)
      return stmt.step() ? stmt.getAsObject() : null
    } finally {
      stmt.free()
    }
  },

  query: (sql: string, params: unknown[] = []): DbRow[] => {
    const stmt = getDatabase().prepare(sql)
    try {
      stmt.bind(params)
      const rows: DbRow[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      return rows
    } finally {
      stmt.free()
    }
  },

  run: (sql: string, params: unknown[] = []): RunResult => {
    const database = getDatabase()
    database.run(sql, params)

    const changes = database.getRowsModified()

    const lastIdResult = database.exec('SELECT last_insert_rowid() as lastId')
    let lastInsertRowid = 0
    if (lastIdResult.length > 0 && lastIdResult[0].values.length > 0) {
      lastInsertRowid = Number(lastIdResult[0].values[0][0])
    }

    markDirty()

    return { changes, lastInsertRowid }
  },

  exec: (sql: string): void => {
    getDatabase().exec(sql)
    markDirty()
  },

  insert: (table: string, data: Record<string, unknown>): number | null => {
    const keys = Object.keys(data)
    const placeholders = keys.map(() => '?').join(', ')
    const values = Object.values(data)

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
    const result = dbAdapter.run(sql, values)

    return result.lastInsertRowid > 0 ? result.lastInsertRowid : null
  }
}


