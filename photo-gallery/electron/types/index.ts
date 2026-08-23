/**
 * Core domain types for the Pic photo gallery application.
 * These types define the shape of data flowing through IPC channels
 * and database operations, ensuring interface consistency across modules.
 */

// ─── Database Entity Types ───

export interface Photo {
  id: number
  filename: string
  filepath: string
  filesize: number
  width: number
  height: number
  created_at: number
  imported_at: number
  rating: number
  is_favorite: number
  thumbnail_path: string | null
  exif_json: string | null
  deleted_at?: number | null
  project_id?: number | null
  original_filepath?: string | null
  review_state: ReviewState
  tags?: string[]
}

export type ReviewState = 'unreviewed' | 'pick' | 'reject'

export interface Project {
  id: number
  name: string
  description: string | null
  created_at: number
  updated_at: number
  photo_count?: number
}

export interface Tag {
  id: number
  name: string
  color: string
  created_at?: number
}

export interface Album {
  id: number
  name: string
  description: string | null
  parent_id: number | null
  created_at: number
  photo_count?: number
}

export interface PhotoTag {
  photo_id: number
  tag_id: number
}

export interface PhotoAlbum {
  photo_id: number
  album_id: number
}

export interface ImportHistory {
  id: number
  source_path: string
  imported_count: number
  imported_at: number
}

// ─── IPC Request / Response Types ───

export interface IpcSuccessResponse<T = unknown> {
  success: true
  data?: T
}

export interface IpcErrorResponse {
  success: false
  error: string
}

export type IpcResponse<T = unknown> = IpcSuccessResponse<T> | IpcErrorResponse

export interface PhotoFilter {
  albumId?: number
  projectId?: number
  rating?: number
  unrated?: boolean
  isFavorite?: boolean
  search?: string
  dateFrom?: number
  dateTo?: number
  tags?: string[]
  deletedOnly?: boolean
  orientation?: 'landscape' | 'portrait' | 'square'
  camera?: string
  lens?: string
  reviewState?: ReviewState | 'all'
}

export interface PhotoQueryOptions {
  filter?: PhotoFilter
  limit?: number
  offset?: number
}

// ─── EXIF Types ───

export interface ExifData {
  rating?: number
  tags?: string[]
  subject?: string
  comment?: string
  dateTaken?: string
  cameraModel?: string
  lensModel?: string
  iso?: number
  aperture?: number
  shutterSpeed?: string
  focalLength?: string
}

export interface ExifOperationResult {
  success: boolean
  error?: string
}

export interface BatchExifResult {
  success: boolean
  results: { filePath: string; success: boolean; error?: string }[]
}

// ─── Import / Rename Types ───

export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  thumbnailsGenerated: number
  total: number
  error?: string
}

export interface ImportProgress {
  total: number
  current: number
  status: 'idle' | 'scanning' | 'importing' | 'generating_thumbnails' | 'done' | 'error'
  message: string
}

export interface RenameOptions {
  sourcePaths: string[]
  outputDir: string
  format: string
  startIndex: number
  prefix: string
  suffix: string
  dateFormat: string
}

export interface RenameResult {
  success: boolean
  results: { source: string; target: string; success: boolean; error?: string }[]
  error?: string
}

// ─── Cache Types ───

export interface CacheStats {
  totalSize: number
  formattedSize: string
  fileCount: number
  oldestFile: string | null
  newestFile: string | null
}

export interface CacheCleanResult {
  deleted: number
  freedSpace: number
}

// ─── Config Types ───

export interface AppConfig {
  downloadDir: string
}

// ─── Crop Types ───

export interface CropParams {
  topRatio: number
  bottomRatio: number
}

export interface CropResult {
  success: boolean
  originalWidth: number
  originalHeight: number
  croppedWidth: number
  croppedHeight: number
  trimmed: boolean
  error?: string
}

// ─── Changelog Types ───

export interface ChangelogCategory {
  name: string
  icon: string
  color: string
  items: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  title: string
  categories: ChangelogCategory[]
}
