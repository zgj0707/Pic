import { createHash } from 'crypto'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

export async function generateThumbnail(
  filePath: string,
  photoId: number,
  thumbDir: string,
  width: number = 300,
  height: number = 200
): Promise<string> {
  const hash = createHash('md5').update(filePath).digest('hex')
  const thumbPath = join(thumbDir, `${hash}.jpg`)
  
  if (existsSync(thumbPath)) {
    return thumbPath
  }
  
  try {
    if (!existsSync(thumbDir)) {
      mkdirSync(thumbDir, { recursive: true })
    }
    
    const sharp = await import('sharp')
    const image = sharp.default(filePath)
    const metadata = await image.metadata()
    
    // 固定宽度，高度自适应，保持原始宽高比
    const thumbWidth = Math.min(width, metadata.width || width)
    
    await sharp.default(filePath)
      .resize(thumbWidth, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toFile(thumbPath)
    
    return thumbPath
  } catch {
    // 缩略图生成失败时返回原文件路径作为降级方案
    return filePath
  }
}

export function getThumbnailPath(filePath: string, thumbDir: string): string {
  const hash = createHash('md5').update(filePath).digest('hex')
  return join(thumbDir, `${hash}.jpg`)
}
