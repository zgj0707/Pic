import { describe, expect, it } from 'vitest'
import { getMaterialSourceCapabilities, normalizeMaterialSourceUrl } from '../../electron/services/materialSources'

describe('material source adapters', () => {
  it('exposes visible-browser capabilities until an official provider is approved', () => {
    expect(getMaterialSourceCapabilities('douyin')).toMatchObject({
      structuredSearch: false,
      preview: 'browser',
      canPersistBinary: false
    })
  })

  it('only accepts URLs belonging to the selected source', () => {
    expect(normalizeMaterialSourceUrl('douyin', 'https://www.douyin.com/video/123')).toBe('https://www.douyin.com/video/123')
    expect(normalizeMaterialSourceUrl('xiaohongshu', 'https://www.xiaohongshu.com/explore/abc')).toBe('https://www.xiaohongshu.com/explore/abc')
    expect(normalizeMaterialSourceUrl('douyin', 'https://evil-douyin.com/video/123')).toBeNull()
    expect(normalizeMaterialSourceUrl('douyin', 'javascript:alert(1)')).toBeNull()
  })
})
