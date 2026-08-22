import { describe, it, expect } from 'vitest'
import { formatBytes } from '../../electron/services/cacheManager'

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('should format bytes under 1KB', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('should format exactly 1KB', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('should format KB values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5120)).toBe('5 KB')
  })

  it('should format exactly 1MB', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })

  it('should format MB values', () => {
    expect(formatBytes(1572864)).toBe('1.5 MB')
    expect(formatBytes(5242880)).toBe('5 MB')
  })

  it('should format exactly 1GB', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })

  it('should format GB values', () => {
    expect(formatBytes(1610612736)).toBe('1.5 GB')
  })

  it('should round to 2 decimal places', () => {
    // 1536 bytes = 1.5 KB exactly
    expect(formatBytes(1536)).toBe('1.5 KB')
    // 1600 bytes = 1.5625 KB → should round to 1.56 KB
    expect(formatBytes(1600)).toBe('1.56 KB')
  })
})
