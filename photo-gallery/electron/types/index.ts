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
  delivered_at?: number | null
  source_url?: string | null
  source_domain?: string | null
  source_type?: 'web' | 'local' | null
  source_note?: string | null
  tags?: string[]
}

export interface ProjectMaterialReference {
  id: number
  project_id: number
  source_type: 'xiaohongshu' | 'douyin'
  source_item_id: string
  media_type: 'image' | 'gallery' | 'video' | 'link'
  title: string
  author: string | null
  original_url: string
  metadata_json: string | null
  created_at: number
}

export type ReviewState = 'unreviewed' | 'pick' | 'reject'

export interface ProjectSelection {
  id: number
  project_id: number
  photo_id: number
  position: number
  created_at: number
  chapter: string
  note: string | null
  photo: Photo
}

export interface ProjectShot {
  id: number
  project_id: number
  photo_id: number
  position: number
  group_id?: number
  chapter: string
  title: string
  intent: string | null
  composition_notes: string | null
  lighting_gear_notes: string | null
  status: 'planned' | 'ready' | 'done'
  created_at: number
  updated_at: number
  photo: Photo
}

export interface ShotGroup {
  id: number
  project_id: number
  name: string
  position: number
  created_at: number
  updated_at: number
}

export interface ProjectExport {
  id: number
  project_id: number
  kind: 'moodboard' | 'shot-list' | 'reference-package'
  target_path: string
  item_count: number
  created_at: number
}

export interface PlanningPdfExportItem {
  shotId: number
  photoId: number
  success: boolean
  error?: string
}

export interface PlanningPdfExportResult {
  success: boolean
  filePath?: string
  exported: number
  failed: number
  results: PlanningPdfExportItem[]
  error?: string
}

export interface PlanningPdfPreflightItem {
  shotId: number
  photoId: number
  filename: string
  ready: boolean
  error?: string
}

export interface PlanningPdfPreflightResult {
  success: boolean
  total: number
  ready: number
  missing: number
  items: PlanningPdfPreflightItem[]
  error?: string
}
export interface Project {
  id: number
  name: string
  description: string | null
  client_name?: string | null
  shoot_date?: string | null
  location?: string | null
  owner?: string | null
  deliverable_goal?: string | null
  cover_photo_id?: number | null
  cover_thumbnail_path?: string | null
  cover_filepath?: string | null
  created_at: number
  updated_at: number
  photo_count?: number
}

export interface ProjectBriefInput {
  name: string
  description?: string | null
  clientName?: string | null
  shootDate?: string | null
  location?: string | null
  owner?: string | null
  deliverableGoal?: string | null
  coverPhotoId?: number | null
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
  sourceType?: 'web' | 'local'
  sourceDomain?: string
  tagsAll?: string[]
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
