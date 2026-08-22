/**
 * 裁切服务
 * 根据用户指定的上下裁切比例进行裁切
 */
import sharp from 'sharp'
import { existsSync, mkdirSync, copyFileSync, renameSync } from 'fs'
import { join, basename } from 'path'
import type { CropResult, CropParams } from '../types'

/**
 * 根据裁切比例裁切图片
 */
export async function cropByRatio(
  filePath: string,
  params: CropParams,
  backupDir?: string
): Promise<CropResult> {
  try {
    if (!existsSync(filePath)) {
      return {
        success: false,
        originalWidth: 0,
        originalHeight: 0,
        croppedWidth: 0,
        croppedHeight: 0,
        trimmed: false,
        error: 'File not found'
      }
    }

    const { width, height } = await sharp(filePath).metadata()

    if (!width || !height) {
      return {
        success: false,
        originalWidth: 0,
        originalHeight: 0,
        croppedWidth: 0,
        croppedHeight: 0,
        trimmed: false,
        error: '无法读取图片尺寸'
      }
    }

    const topCrop = Math.floor(height * (params.topRatio / 100))
    const bottomCrop = Math.floor(height * (params.bottomRatio / 100))

    const cropTop = topCrop
    const cropHeight = height - topCrop - bottomCrop

    if (cropHeight < 10 || cropHeight > height - 10) {
      return {
        success: true,
        originalWidth: width,
        originalHeight: height,
        croppedWidth: width,
        croppedHeight: height,
        trimmed: false
      }
    }

    // 备份原图
    if (backupDir) {
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true })
      }
      const backupPath = join(backupDir, Date.now() + '_' + basename(filePath))
      copyFileSync(filePath, backupPath)
    }

    // 执行裁切
    await sharp(filePath)
      .extract({
        left: 0,
        top: cropTop,
        width: width,
        height: cropHeight
      })
      .toFile(filePath + '.tmp')

    renameSync(filePath + '.tmp', filePath)

    console.log(`Cropped: ${basename(filePath)} - Top: ${params.topRatio}%, Bottom: ${params.bottomRatio}%`)
    console.log(`  Original: ${width}x${height} -> Cropped: ${width}x${cropHeight}`)

    return {
      success: true,
      originalWidth: width,
      originalHeight: height,
      croppedWidth: width,
      croppedHeight: cropHeight,
      trimmed: true
    }
  } catch (error) {
    console.error('Failed to crop image:', error)
    return {
      success: false,
      originalWidth: 0,
      originalHeight: 0,
      croppedWidth: 0,
      croppedHeight: 0,
      trimmed: false,
      error: String(error)
    }
  }
}
