/**
 * Database result parsing helpers.
 *
 * Eliminates the repeated `Array.isArray(result) ? result : [result]`
 * pattern that appeared throughout tagManager.ts and photo.ts.
 *
 * Note: dbAdapter.query() always returns an array.
 *       dbAdapter.get() always returns a single row object or null.
 *       The original code defensively wrapped get() results in arrays
 *       due to confusion about the return type. These helpers make
 *       the intent explicit and type-safe.
 */

import type { Tag } from '../types'

/**
 * Convert a database record (plain object) into a typed Tag.
 */
export function recordToTag(record: Record<string, unknown>): Tag {
  return {
    id: record.id as number,
    name: record.name as string,
    color: (record.color ?? '#0078d4') as string,
    created_at: record.created_at as number | undefined
  }
}

/**
 * Convert multiple database records into typed Tags.
 */
export function recordsToTags(records: Record<string, unknown>[]): Tag[] {
  return records.map(recordToTag)
}

/**
 * Generate SQL placeholders for an IN clause.
 * Example: buildInPlaceholders([1,2,3]) => "?,?,?"
 */
export function buildInPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',')
}
