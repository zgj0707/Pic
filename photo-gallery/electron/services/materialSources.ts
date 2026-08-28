/**
 * Source-neutral contracts for the material browser.
 *
 * The current Douyin integration intentionally uses the visible browser
 * fallback.  Keeping the contract in the content module lets a future
 * approved OpenAPI provider replace it without changing project storage or
 * renderer state.
 */

export type MaterialSource = 'xiaohongshu' | 'douyin'
export type MaterialMediaType = 'image' | 'gallery' | 'video' | 'link'

export interface SourceCapabilities {
  structuredSearch: boolean
  preview: 'image' | 'iframe' | 'external' | 'browser'
  canPersistBinary: boolean
  supportedMediaTypes: MaterialMediaType[]
}

export interface MaterialItem {
  source: MaterialSource
  sourceItemId: string
  mediaType: MaterialMediaType
  title: string
  author?: string
  previewUrl?: string
  originalUrl: string
  publishedAt?: string
  durationMs?: number
  width?: number
  height?: number
  stats?: { likes?: number; comments?: number }
  rawVersion: number
}

export interface MaterialSourceAdapter {
  readonly source: MaterialSource
  getCapabilities(): SourceCapabilities
  normalizeUrl(rawUrl: string): string | null
}

function normalizeHttpUrl(rawUrl: string, source: MaterialSource): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return null
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    const allowed = source === 'douyin'
      ? host === 'douyin.com' || host.endsWith('.douyin.com')
      : host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com') || host === 'xhslink.com' || host.endsWith('.xhslink.com')
    if (!allowed) return null
    return parsed.toString()
  } catch {
    return null
  }
}

const visibleBrowserCapabilities: SourceCapabilities = {
  structuredSearch: false,
  preview: 'browser',
  canPersistBinary: false,
  supportedMediaTypes: ['image', 'gallery', 'video', 'link']
}

export const materialSourceAdapters: Record<MaterialSource, MaterialSourceAdapter> = {
  xiaohongshu: {
    source: 'xiaohongshu',
    getCapabilities: () => visibleBrowserCapabilities,
    normalizeUrl: rawUrl => normalizeHttpUrl(rawUrl, 'xiaohongshu')
  },
  douyin: {
    source: 'douyin',
    getCapabilities: () => visibleBrowserCapabilities,
    normalizeUrl: rawUrl => normalizeHttpUrl(rawUrl, 'douyin')
  }
}

export function getMaterialSourceCapabilities(source: MaterialSource): SourceCapabilities {
  return materialSourceAdapters[source].getCapabilities()
}

export function normalizeMaterialSourceUrl(source: MaterialSource, rawUrl: string): string | null {
  return materialSourceAdapters[source].normalizeUrl(rawUrl)
}
