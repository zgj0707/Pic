import { createHash } from 'crypto'
import { join } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'
import { getCacheDir, enforceMaxCacheSize } from './cacheManager'

export type ThumbnailSize = 'grid' | 'preview'

interface SizeConfig {
  width: number
  quality: number
}

const SIZE_CONFIG: Record<ThumbnailSize, SizeConfig> = {
  grid: { width: 320, quality: 80 },
  preview: { width: 1200, quality: 85 }
}

function getThumbnailHash(filePath: string, mtimeMs: number, size: ThumbnailSize): string {
  return createHash('md5').update(`${filePath}|${mtimeMs}|${size}`).digest('hex')
}

/**
 * 生成或复用缩略图。
 * 缓存键包含文件路径、修改时间和尺寸，文件变更后会自动重新生成。
 * 输出格式为 WebP，相同视觉质量下体积更小。
 */
export async function generateThumbnail(
  filePath: string,
  size: ThumbnailSize = 'grid'
): Promise<string> {
  const stats = statSync(filePath)
  const mtimeMs = stats.mtimeMs
  const thumbDir = getCacheDir()
  const hash = getThumbnailHash(filePath, mtimeMs, size)
  const thumbPath = join(thumbDir, `${hash}.webp`)

  if (existsSync(thumbPath)) {
    return thumbPath
  }

  if (!existsSync(thumbDir)) {
    mkdirSync(thumbDir, { recursive: true })
  }

  const sharp = await import('sharp')
  const config = SIZE_CONFIG[size]

  await sharp.default(filePath)
    .resize(config.width, null, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: config.quality })
    .toFile(thumbPath)

  // 异步触发缓存容量上限清理，失败不影响缩略图返回
  enforceMaxCacheSize().catch(() => {})

  return thumbPath
}

/**
 * 仅获取缩略图路径，不触发生成。
 * 若文件不存在或无法读取，返回原图路径。
 */
export function getThumbnailPath(filePath: string, size: ThumbnailSize = 'grid'): string {
  try {
    const stats = statSync(filePath)
    const hash = getThumbnailHash(filePath, stats.mtimeMs, size)
    return join(getCacheDir(), `${hash}.webp`)
  } catch {
    return filePath
  }
}
