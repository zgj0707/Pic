import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'

const PAGE_WIDTH = 595.276
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 40
const FRAME_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const FRAME_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2
const MAX_IMAGE_WIDTH = Math.ceil(FRAME_WIDTH * 2.2)
const MAX_IMAGE_HEIGHT = Math.ceil(FRAME_HEIGHT * 2.2)

export interface PdfExportItem {
  sourcePath: string
  success: boolean
  error?: string
}

export interface PdfExportResult {
  success: boolean
  filePath?: string
  exported: number
  failed: number
  results: PdfExportItem[]
  error?: string
}

interface PreparedImage {
  sourcePath: string
  data: Buffer
  width: number
  height: number
}

interface PdfObject {
  body: Buffer
}

/**
 * Keep the PDF name safe for Windows desktop paths while retaining Chinese names.
 * This intentionally mirrors the desktop-export naming behavior without changing it.
 */
export function sanitizePdfBaseName(value: string): string {
  const withoutControls = Array.from(String(value || ''))
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
  const cleaned = withoutControls
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return cleaned || 'Pic-样片'
}

export function availablePdfPath(desktopPath: string, requestedBaseName: string): string {
  const baseName = sanitizePdfBaseName(requestedBaseName)
  const extension = extname(baseName).toLowerCase() === '.pdf' ? '' : '.pdf'
  const stem = extension ? baseName : basename(baseName, extname(baseName))
  let targetPath = join(desktopPath, stem + extension)
  let suffix = 2
  while (existsSync(targetPath)) {
    targetPath = join(desktopPath, `${stem}-${suffix}${extension}`)
    suffix += 1
  }
  return targetPath
}

async function prepareImage(sourcePath: string): Promise<PreparedImage> {
  const sharp = await import('sharp')
  // Read the source first so libvips processes an in-memory buffer instead of
  // retaining a Windows file handle after the export promise resolves.
  const sourceData = readFileSync(sourcePath)
  const result = await sharp.default(sourceData)
    // Respect the source EXIF orientation before measuring and placing the image.
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({
      width: MAX_IMAGE_WIDTH,
      height: MAX_IMAGE_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true })

  if (!result.info.width || !result.info.height || result.data.length === 0) {
    throw new Error('图片尺寸无效')
  }

  return {
    sourcePath,
    data: result.data,
    width: result.info.width,
    height: result.info.height
  }
}

function asciiObject(body: string): Buffer {
  return Buffer.from(body, 'ascii')
}

function streamObject(dictionary: string, data: Buffer): Buffer {
  return Buffer.concat([
    asciiObject(`${dictionary}\n/Length ${data.length} >>\nstream\n`),
    data,
    asciiObject('\nendstream')
  ])
}

function buildPageContent(width: number, height: number, imageName: string): Buffer {
  const scale = Math.min(FRAME_WIDTH / width, FRAME_HEIGHT / height)
  const displayWidth = width * scale
  const displayHeight = height * scale
  const x = (PAGE_WIDTH - displayWidth) / 2
  const y = (PAGE_HEIGHT - displayHeight) / 2
  const content = [
    'q',
    '1 1 1 rg',
    `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re`,
    'f',
    'q',
    `${displayWidth} 0 0 ${displayHeight} ${x} ${y} cm`,
    `/${imageName} Do`,
    'Q',
    'Q'
  ].join('\n')
  return Buffer.from(content, 'ascii')
}

function buildPdfBuffer(images: PreparedImage[]): Buffer {
  const objects: Array<PdfObject | undefined> = [undefined]
  const pageObjectIds: number[] = []

  // Object 1 is the catalog and object 2 is filled with the page tree below.
  objects.push({ body: asciiObject('<< /Type /Catalog /Pages 2 0 R >>') })
  objects.push(undefined)

  images.forEach(image => {
    const pageObjectId = objects.length
    objects.push(undefined)
    const contentObjectId = objects.length
    objects.push({
      body: streamObject('<<', buildPageContent(image.width, image.height, 'Im0'))
    })
    const imageObjectId = objects.length
    objects.push({
      body: streamObject(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        image.data
      )
    })
    objects[pageObjectId] = {
      body: asciiObject(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> ` +
        `/Contents ${contentObjectId} 0 R >>`
      )
    }
    pageObjectIds.push(pageObjectId)

  })

  objects[2] = {
    body: asciiObject(
      `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`
    )
  }

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')
  const chunks: Buffer[] = [header]
  const offsets: number[] = [0]
  let offset = header.length

  objects.slice(1).forEach((object, index) => {
    if (!object) throw new Error(`PDF object ${index + 1} is missing`)
    const objectBuffer = Buffer.concat([
      asciiObject(`${index + 1} 0 obj\n`),
      object.body,
      asciiObject('\nendobj\n')
    ])
    offsets.push(offset)
    chunks.push(objectBuffer)
    offset += objectBuffer.length
  })

  const xrefOffset = offset
  const xrefLines = [`xref`, `0 ${objects.length}`, '0000000000 65535 f ']
  for (let index = 1; index < offsets.length; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `)
  }
  const trailer = [
    `trailer`,
    `<< /Size ${objects.length} /Root 1 0 R >>`,
    `startxref`,
    String(xrefOffset),
    '%%EOF'
  ].join('\n')
  chunks.push(Buffer.from(xrefLines.join('\n') + '\n' + trailer + '\n', 'ascii'))
  return Buffer.concat(chunks)
}

export async function exportPhotosToPdf(
  filePaths: string[],
  requestedBaseName: string,
  desktopPath: string
): Promise<PdfExportResult> {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { success: false, exported: 0, failed: 0, results: [], error: '没有可导出的样片' }
  }

  const results: PdfExportItem[] = []
  const images: PreparedImage[] = []
  for (const sourcePath of filePaths) {
    if (!sourcePath || !existsSync(sourcePath)) {
      results.push({ sourcePath, success: false, error: '原图文件不存在' })
      continue
    }
    try {
      images.push(await prepareImage(sourcePath))
      results.push({ sourcePath, success: true })
    } catch (error) {
      results.push({
        sourcePath,
        success: false,
        error: error instanceof Error ? error.message : '图片处理失败'
      })
    }
  }

  if (images.length === 0) {
    return {
      success: false,
      exported: 0,
      failed: results.length,
      results,
      error: '没有可导出的有效图片'
    }
  }

  if (!desktopPath || !existsSync(desktopPath)) {
    return {
      success: false,
      exported: 0,
      failed: results.length,
      results,
      error: '桌面目录不存在'
    }
  }

  const targetPath = availablePdfPath(desktopPath, requestedBaseName)
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  try {
    mkdirSync(desktopPath, { recursive: true })
    writeFileSync(temporaryPath, buildPdfBuffer(images))
    renameSync(temporaryPath, targetPath)

  } catch (error) {
    try { unlinkSync(temporaryPath) } catch { /* best effort cleanup */ }
    return {
      success: false,
      exported: 0,
      failed: results.length,
      results,
      error: error instanceof Error ? error.message : 'PDF 写入失败'
    }
  }

  const failed = results.filter(result => !result.success).length
  return {
    success: failed === 0,
    filePath: targetPath,
    exported: images.length,
    failed,
    results,
    error: failed > 0 ? `${failed} 张样片未能加入 PDF` : undefined
  }
}
