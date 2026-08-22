/**
 * Shared EXIF tag synchronization logic.
 *
 * Previously, syncTagsToPhotoExif was duplicated in both
 * electron/ipc/photo.ts and electron/ipc/tagManager.ts with
 * identical implementations. This module provides a single source.
 */

import { dbAdapter } from '../services/database'
import { writeExifTags } from '../ipc/exifTool'

/**
 * Synchronize database tags to a photo's EXIF data.
 *
 * Looks up the photo's filepath and current tags from the database,
 * then writes them to the file's EXIF metadata via ExifTool.
 * Silently skips if the photo or file path is missing, or if
 * there are no tags to write.
 *
 * @param photoId - The database ID of the photo to sync
 */
export async function syncTagsToPhotoExif(photoId: number): Promise<void> {
  try {
    const photoResult = dbAdapter.get('SELECT filepath FROM photos WHERE id = ? AND deleted_at IS NULL', [photoId])
    if (!photoResult) return

    const filepath = photoResult.filepath as string
    if (!filepath) return

    const tagsResult = dbAdapter.query(
      'SELECT t.name FROM tags t JOIN photo_tags pt ON t.id = pt.tag_id WHERE pt.photo_id = ?',
      [photoId]
    )

    const tags: string[] = tagsResult.map(t => t.name)

    if (tags.length > 0) {
      await writeExifTags(filepath, tags)
    }
  } catch (e) {
    console.error(`Failed to sync tags to EXIF for photo ${photoId}:`, e)
  }
}
