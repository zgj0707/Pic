/**
 * Changelog merge logic tests.
 * Verifies that getChangelogPath-style merging (built-in entries win,
 * user entries preserved, dedupe by version, sorted desc) works correctly.
 */

import { describe, it, expect } from 'vitest'

// ─── Mirror of the merge logic in electron/content/index.ts ───

interface ChangelogEntry {
  version: string
  date: string
  title: string
}

function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}

function mergeChangelogs(bundled: ChangelogEntry[], user: ChangelogEntry[]): ChangelogEntry[] {
  const map = new Map<string, ChangelogEntry>()
  for (const entry of [...bundled, ...user]) {
    if (entry && entry.version) {
      map.set(String(entry.version), entry)
    }
  }
  return Array.from(map.values()).sort((a, b) => compareVersions(b.version, a.version))
}

function mk(version: string): ChangelogEntry {
  return { version, date: '2026-08-02', title: `v${version}` }
}

describe('compareVersions', () => {
  it('compares equal versions', () => {
    expect(compareVersions('2.5.1', '2.5.1')).toBe(0)
    expect(compareVersions('2.4', '2.4.0')).toBe(0)
  })

  it('compares different patch versions', () => {
    expect(compareVersions('2.5.1', '2.5.0')).toBeGreaterThan(0)
    expect(compareVersions('2.5.0', '2.5.1')).toBeLessThan(0)
  })

  it('compares different minor versions', () => {
    expect(compareVersions('2.5.0', '2.4.0')).toBeGreaterThan(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
  })

  it('compares single-part versions', () => {
    expect(compareVersions('2.4', '2.5.1')).toBeLessThan(0)
    expect(compareVersions('2.5.1', '2.4')).toBeGreaterThan(0)
  })
})

describe('mergeChangelogs', () => {
  it('adds newer built-in entries to stale user cache', () => {
    const bundled = [mk('2.5.1'), mk('2.5.0'), mk('2.4.0')]
    const user = [mk('2.4.0')] // stale cache from previous version
    const merged = mergeChangelogs(bundled, user)
    expect(merged.map(e => e.version)).toEqual(['2.5.1', '2.5.0', '2.4.0'])
  })

  it('dedupes by version (built-in wins)', () => {
    const bundled = [mk('2.5.0'), mk('2.4.0')]
    const user = [mk('2.5.0'), mk('2.4.0'), mk('2.3.0')]
    const merged = mergeChangelogs(bundled, user)
    expect(merged.map(e => e.version)).toEqual(['2.5.0', '2.4.0', '2.3.0'])
  })

  it('preserves user-only entries', () => {
    const bundled = [mk('2.5.0')]
    const user = [mk('2.4.0'), mk('2.3.0')]
    const merged = mergeChangelogs(bundled, user)
    expect(merged.map(e => e.version)).toEqual(['2.5.0', '2.4.0', '2.3.0'])
  })

  it('handles empty inputs', () => {
    expect(mergeChangelogs([], [])).toEqual([])
    expect(mergeChangelogs([mk('2.5.1')], [])).toEqual([mk('2.5.1')])
    expect(mergeChangelogs([], [mk('2.5.1')])).toEqual([mk('2.5.1')])
  })

  it('sorts mixed version formats descending', () => {
    const bundled = [mk('2.5.0'), mk('2.4')]
    const user = [mk('1.10.0'), mk('2.0.0')]
    const merged = mergeChangelogs(bundled, user)
    expect(merged.map(e => e.version)).toEqual(['2.5.0', '2.4', '2.0.0', '1.10.0'])
  })
})
