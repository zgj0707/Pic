import { existsSync, statSync, mkdirSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024
const MAX_AGE_DAYS = 30

interface CacheStats {
  totalSize: number
  fileCount: number
  oldestFile: string | null
  newestFile: string | null
}

interface CacheEntry {
  path: string
  size: number
  mtime: number
}

export function getCacheDir(): string {
  const cacheDir = join(app.getPath('userData'), 'cache', 'thumb')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

export async function getCacheStats(): Promise<CacheStats> {
  const cacheDir = getCacheDir()
  const entries: CacheEntry[] = []
  
  if (!existsSync(cacheDir)) {
    return { totalSize: 0, fileCount: 0, oldestFile: null, newestFile: null }
  }
  
  try {
    const files = readdirSync(cacheDir)
    let totalSize = 0
    let oldestMtime = Infinity
    let newestMtime = 0
    let oldestFile: string | null = null
    let newestFile: string | null = null
    
    for (const file of files) {
      if (!file.endsWith('.jpg') && !file.endsWith('.png')) continue
      
      const filePath = join(cacheDir, file)
      try {
        const stat = statSync(filePath)
        totalSize += stat.size
        entries.push({ path: filePath, size: stat.size, mtime: stat.mtimeMs })
        
        if (stat.mtimeMs < oldestMtime) {
          oldestMtime = stat.mtimeMs
          oldestFile = file
        }
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs
          newestFile = file
        }
      } catch {
        continue
      }
    }
    
    return { totalSize, fileCount: entries.length, oldestFile, newestFile }
  } catch {
    return { totalSize: 0, fileCount: 0, oldestFile: null, newestFile: null }
  }
}

export async function cleanOldThumbnails(): Promise<{ deleted: number; freedSpace: number }> {
  const cacheDir = getCacheDir()
  const maxAge = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
  let deleted = 0
  let freedSpace = 0
  
  if (!existsSync(cacheDir)) {
    return { deleted, freedSpace }
  }
  
  try {
    const files = readdirSync(cacheDir)
    
    for (const file of files) {
      if (!file.endsWith('.jpg') && !file.endsWith('.png')) continue
      
      const filePath = join(cacheDir, file)
      try {
        const stat = statSync(filePath)
        if (stat.mtimeMs < maxAge) {
          freedSpace += stat.size
          unlinkSync(filePath)
          deleted++
        }
      } catch {
        continue
      }
    }
  } catch {
    // ignore errors
  }
  
  return { deleted, freedSpace }
}

export async function clearThumbnailCache(): Promise<{ deleted: number; freedSpace: number }> {
  const cacheDir = getCacheDir()
  let deleted = 0
  let freedSpace = 0
  
  if (!existsSync(cacheDir)) {
    return { deleted, freedSpace }
  }
  
  try {
    const files = readdirSync(cacheDir)
    
    for (const file of files) {
      const filePath = join(cacheDir, file)
      try {
        const stat = statSync(filePath)
        freedSpace += stat.size
        unlinkSync(filePath)
        deleted++
      } catch {
        continue
      }
    }
  } catch {
    // ignore errors
  }
  
  return { deleted, freedSpace }
}

export async function enforceMaxCacheSize(): Promise<{ deleted: number; freedSpace: number }> {
  const cacheDir = getCacheDir()
  let deleted = 0
  let freedSpace = 0
  
  if (!existsSync(cacheDir)) {
    return { deleted, freedSpace }
  }
  
  const stats = await getCacheStats()
  
  if (stats.totalSize <= MAX_CACHE_SIZE) {
    return { deleted: 0, freedSpace: 0 }
  }
  
  const entries: CacheEntry[] = []
  try {
    const files = readdirSync(cacheDir)
    
    for (const file of files) {
      if (!file.endsWith('.jpg') && !file.endsWith('.png')) continue
      
      const filePath = join(cacheDir, file)
      try {
        const stat = statSync(filePath)
        entries.push({ path: filePath, size: stat.size, mtime: stat.mtimeMs })
      } catch {
        continue
      }
    }
  } catch {
    return { deleted, freedSpace }
  }
  
  entries.sort((a, b) => a.mtime - b.mtime)
  
  let currentSize = stats.totalSize
  for (const entry of entries) {
    if (currentSize <= MAX_CACHE_SIZE * 0.9) {
      break
    }
    
    try {
      unlinkSync(entry.path)
      currentSize -= entry.size
      freedSpace += entry.size
      deleted++
    } catch {
      continue
    }
  }
  
  return { deleted, freedSpace }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
