import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initializeDatabase, closeDatabase, dbAdapter, saveDatabase } from '../../electron/services/database'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('Database Service', () => {
  let tempDir: string

  beforeAll(async () => {
    // Create a temp directory for the test database
    tempDir = mkdtempSync(join(tmpdir(), 'pic-db-test-'))
    await initializeDatabase(tempDir)
  })

  it('should create the columns required by project and recycle-bin features', () => {
    const columns = dbAdapter.query('PRAGMA table_info(photos)')
    const columnNames = columns.map(column => column.name)

    expect(columnNames).toContain('deleted_at')
    expect(columnNames).toContain('project_id')
    expect(columnNames).toContain('original_filepath')
    expect(columnNames).toContain('source_url')
    expect(columnNames).toContain('source_domain')
    expect(columnNames).toContain('source_type')
    expect(columnNames).toContain('source_note')
  })

  afterAll(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('dbAdapter.insert', () => {
    it('should insert a photo and return the ID', () => {
      const id = dbAdapter.insert('photos', {
        filename: 'test.jpg',
        filepath: '/path/to/test.jpg',
        filesize: 1024,
        width: 1920,
        height: 1080,
        created_at: 1700000000,
        exif_json: null
      })

      expect(id).not.toBeNull()
      expect(id).toBeGreaterThan(0)
    })

    it('should insert multiple photos with unique filepaths', () => {
      const id1 = dbAdapter.insert('photos', {
        filename: 'test1.jpg',
        filepath: '/path/to/test1.jpg',
        filesize: 512,
        width: 800,
        height: 600,
        created_at: 1700000001,
        exif_json: null
      })
      const id2 = dbAdapter.insert('photos', {
        filename: 'test2.jpg',
        filepath: '/path/to/test2.jpg',
        filesize: 256,
        width: 400,
        height: 300,
        created_at: 1700000002,
        exif_json: null
      })

      expect(id1).not.toBeNull()
      expect(id2).not.toBeNull()
      expect(id2).toBeGreaterThan(id1!)
    })
  })

  describe('dbAdapter.get', () => {
    it('should retrieve a single photo by ID', () => {
      const photo = dbAdapter.get('SELECT * FROM photos WHERE filepath = ?', ['/path/to/test.jpg'])

      expect(photo).not.toBeNull()
      expect(photo!.filename).toBe('test.jpg')
      expect(photo!.filepath).toBe('/path/to/test.jpg')
      expect(photo!.filesize).toBe(1024)
      expect(photo!.width).toBe(1920)
      expect(photo!.height).toBe(1080)
    })

    it('should return null for non-existent record', () => {
      const photo = dbAdapter.get('SELECT * FROM photos WHERE filepath = ?', ['/nonexistent/path.jpg'])
      expect(photo).toBeNull()
    })

    it('should handle query without params', () => {
      const photo = dbAdapter.get('SELECT * FROM photos LIMIT 1')
      expect(photo).not.toBeNull()
    })
  })

  describe('dbAdapter.query', () => {
    it('should retrieve all photos as array', () => {
      const photos = dbAdapter.query('SELECT * FROM photos ORDER BY id')
      expect(photos).toHaveLength(3)
    })

    it('should return empty array for no matches', () => {
      const photos = dbAdapter.query('SELECT * FROM photos WHERE filesize > 999999')
      expect(photos).toEqual([])
    })

    it('should filter by params', () => {
      const photos = dbAdapter.query('SELECT * FROM photos WHERE filesize > ?', [300])
      expect(photos).toHaveLength(2) // 1024 and 512
    })
  })

  describe('dbAdapter.run', () => {
    it('should update a photo and return changes count', () => {
      const result = dbAdapter.run('UPDATE photos SET rating = ? WHERE filepath = ?', [5, '/path/to/test.jpg'])
      expect(result.changes).toBe(1)

      const photo = dbAdapter.get('SELECT rating FROM photos WHERE filepath = ?', ['/path/to/test.jpg'])
      expect(photo!.rating).toBe(5)
    })

    it('should return 0 changes for non-matching update', () => {
      const result = dbAdapter.run('UPDATE photos SET rating = ? WHERE filepath = ?', [1, '/nonexistent.jpg'])
      expect(result.changes).toBe(0)
    })

    it('should insert and return lastInsertRowid', () => {
      const result = dbAdapter.run(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        ['test-tag', '#ff0000']
      )
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowid).toBeGreaterThan(0)
    })
  })

  describe('dbAdapter with tags and photo_tags', () => {
    let photoId: number
    let tagId: number

    beforeEach(() => {
      // Get an existing photo ID
      const photo = dbAdapter.get('SELECT id FROM photos WHERE filepath = ?', ['/path/to/test1.jpg'])
      photoId = photo!.id

      // Create a tag
      const tagResult = dbAdapter.run(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        ['portrait', '#blue']
      )
      tagId = tagResult.lastInsertRowid

      // Link tag to photo
      dbAdapter.run('INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, ?)', [photoId, tagId])
    })

    it('should query tags for a photo via JOIN', () => {
      const tags = dbAdapter.query(`
        SELECT t.name FROM tags t
        JOIN photo_tags pt ON t.id = pt.tag_id
        WHERE pt.photo_id = ?
      `, [photoId])

      expect(tags).toHaveLength(1)
      expect(tags[0].name).toBe('portrait')
    })
  })

  describe('dbAdapter.exec', () => {
    it('should execute raw SQL', () => {
      dbAdapter.exec('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, value TEXT)')
      dbAdapter.run('INSERT INTO test_table (value) VALUES (?)', ['hello'])

      const row = dbAdapter.get('SELECT value FROM test_table WHERE id = ?', [1])
      expect(row!.value).toBe('hello')
    })
  })

  describe('saveDatabase persistence', () => {
    it('should persist data to disk file', () => {
      saveDatabase()
      const dbFile = join(tempDir, 'database', 'gallery.db')
      expect(existsSync(dbFile)).toBe(true)
    })
  })

  describe('Parameter substitution edge cases', () => {
    it('should handle string params with single quotes', () => {
      dbAdapter.insert('photos', {
        filename: "O'Brien.jpg",
        filepath: "/path/O'Brien.jpg",
        filesize: 100,
        width: 100,
        height: 100,
        created_at: 1,
        exif_json: null
      })

      const photo = dbAdapter.get("SELECT * FROM photos WHERE filepath = ?", ["/path/O'Brien.jpg"])
      expect(photo).not.toBeNull()
      expect(photo!.filename).toBe("O'Brien.jpg")
    })

    it('should handle null params', () => {
      const result = dbAdapter.run(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        ['null-color-tag', null]
      )
      expect(result.changes).toBe(1)

      const tag = dbAdapter.get('SELECT * FROM tags WHERE name = ?', ['null-color-tag'])
      expect(tag).not.toBeNull()
      expect(tag!.color).toBeNull()
    })

    it('should handle numeric params', () => {
      const photos = dbAdapter.query('SELECT * FROM photos WHERE filesize >= ? ORDER BY filesize', [500])
      expect(photos.length).toBeGreaterThanOrEqual(2)
    })
  })
})
