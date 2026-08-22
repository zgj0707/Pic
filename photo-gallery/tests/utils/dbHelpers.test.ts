import { describe, it, expect } from 'vitest'
import { recordToTag, recordsToTags, buildInPlaceholders } from '../../electron/utils/dbHelpers'

describe('recordToTag', () => {
  it('should convert a database record to a Tag object', () => {
    const record = { id: 1, name: 'portrait', color: '#ff0000', created_at: 1700000000 }
    const tag = recordToTag(record)

    expect(tag.id).toBe(1)
    expect(tag.name).toBe('portrait')
    expect(tag.color).toBe('#ff0000')
    expect(tag.created_at).toBe(1700000000)
  })

  it('should use default color when color is null', () => {
    const record = { id: 2, name: 'landscape', color: null }
    const tag = recordToTag(record)

    expect(tag.color).toBe('#0078d4')
  })

  it('should use default color when color is undefined', () => {
    const record = { id: 3, name: 'wedding', color: undefined }
    const tag = recordToTag(record)

    expect(tag.color).toBe('#0078d4')
  })

  it('should handle missing created_at field', () => {
    const record = { id: 4, name: 'events', color: '#00ff00' }
    const tag = recordToTag(record)

    expect(tag.created_at).toBeUndefined()
  })
})

describe('recordsToTags', () => {
  it('should convert multiple records to Tag objects', () => {
    const records = [
      { id: 1, name: 'tag1', color: '#ff0000', created_at: 1000 },
      { id: 2, name: 'tag2', color: '#00ff00', created_at: 2000 }
    ]
    const tags = recordsToTags(records)

    expect(tags).toHaveLength(2)
    expect(tags[0].name).toBe('tag1')
    expect(tags[1].name).toBe('tag2')
  })

  it('should return empty array for empty input', () => {
    const tags = recordsToTags([])
    expect(tags).toEqual([])
  })

  it('should handle records with missing color', () => {
    const records = [
      { id: 1, name: 'tag1' },
      { id: 2, name: 'tag2', color: '#custom' }
    ]
    const tags = recordsToTags(records)

    expect(tags[0].color).toBe('#0078d4')
    expect(tags[1].color).toBe('#custom')
  })
})

describe('buildInPlaceholders', () => {
  it('should generate correct number of placeholders', () => {
    expect(buildInPlaceholders(1)).toBe('?')
    expect(buildInPlaceholders(3)).toBe('?,?,?')
    expect(buildInPlaceholders(5)).toBe('?,?,?,?,?')
  })

  it('should return empty string for zero count', () => {
    expect(buildInPlaceholders(0)).toBe('')
  })

  it('should handle large counts', () => {
    const result = buildInPlaceholders(100)
    expect(result.split(',')).toHaveLength(100)
  })
})
