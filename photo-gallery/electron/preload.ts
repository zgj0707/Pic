import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Photo, PhotoQueryOptions, PhotoFilter, ReviewState, Tag, ExifData, Project, ProjectBriefInput, ProjectSelection, ProjectShot, ProjectExport,
  ImportResult, ImportProgress, ProjectMaterialReference,
  CacheStats, CacheCleanResult, IpcResponse, ChangelogEntry
} from './types'

/**
 * The typed API exposed to the renderer process via contextBridge.
 * The renderer accesses these methods via `window.electronAPI`.
 */
export interface ElectronAPI {
  dialog: {
    openDirectory: () => Promise<string | null>
    openFile: () => Promise<string[]>
  }
  photos: {
    getAll: (options?: PhotoQueryOptions) => Promise<Photo[]>
    count: (filter?: PhotoFilter) => Promise<number>
    getById: (id: number) => Promise<Photo | null>
    updateRating: (id: number, rating: number) => Promise<{ success: boolean }>
    setReviewState: (id: number, state: ReviewState) => Promise<{ success: boolean }>
    batchSetReviewState: (ids: number[], state: ReviewState) => Promise<{ success: boolean; updated?: number }>
    countByReviewState: (projectId: number) => Promise<Record<ReviewState, number>>
    updateTags: (id: number, tags: string[]) => Promise<{ success: boolean }>
    updateSourceNote: (id: number, note: string) => Promise<{ success: boolean }>
    toggleFavorite: (id: number) => Promise<{ success: boolean }>
    delete: (ids: number[]) => Promise<{ success: boolean; moved?: number; failed?: number; error?: string }>
    restore: (ids: number[]) => Promise<{ success: boolean; restored?: number; failed?: number; error?: string }>
    deletePermanently: (ids: number[]) => Promise<{ success: boolean; deleted?: number; failed?: number; error?: string }>
    getDeleted: (options?: PhotoQueryOptions) => Promise<Photo[]>
    countDeleted: () => Promise<number>
    openInExplorer: (filePath: string) => Promise<{ success: boolean }>
    generateThumbnails: () => Promise<{ success: boolean; generated: number }>
    getThumbnail: (id: number, size?: 'grid' | 'preview') => Promise<{ success: boolean; data?: { path: string }; error?: string }>
    copyToDesktopFolder: (filePaths: string[], folderName: string) =>
      Promise<{ success: boolean; folderPath?: string; copied?: number; failed?: number; error?: string }>
    exportToPdf: (filePaths: string[], fileBaseName: string) =>
      Promise<{ success: boolean; filePath?: string; exported?: number; failed?: number; error?: string }>
    copyImageToClipboard: (filePath: string) => Promise<{ success: boolean; error?: string }>
  }
  selections: {
    getAll: (projectId: number) => Promise<ProjectSelection[]>
    add: (projectId: number, photoId: number) => Promise<{ success: boolean; selection?: ProjectSelection; error?: string }>
    remove: (projectId: number, photoId: number) => Promise<{ success: boolean; error?: string }>
    reorder: (projectId: number, photoIds: number[]) => Promise<{ success: boolean; selections?: ProjectSelection[]; error?: string }>
    updateMeta: (projectId: number, photoId: number, chapter: string, note: string) => Promise<{ success: boolean; selection?: ProjectSelection; error?: string }>
  },
  shots: {
    getAll: (projectId: number) => Promise<ProjectShot[]>
    create: (projectId: number, photoId: number, input?: { chapter?: string; title?: string; intent?: string | null; compositionNotes?: string | null; lightingGearNotes?: string | null; status?: 'planned' | 'ready' | 'done' }) => Promise<{ success: boolean; shot?: ProjectShot; error?: string }>
    generateFromSelections: (projectId: number) => Promise<{ success: boolean; shots?: ProjectShot[]; error?: string }>
    update: (projectId: number, shotId: number, input: { title?: string; intent?: string | null; compositionNotes?: string | null; lightingGearNotes?: string | null; status?: 'planned' | 'ready' | 'done' }) => Promise<{ success: boolean; shot?: ProjectShot; error?: string }>
    reorder: (projectId: number, shotIds: number[]) => Promise<{ success: boolean; shots?: ProjectShot[]; error?: string }>
    remove: (projectId: number, shotId: number) => Promise<{ success: boolean; error?: string }>
  }
  planningExports: {
    getAll: (projectId: number) => Promise<ProjectExport[]>
    record: (projectId: number, kind: ProjectExport['kind'], targetPath: string, itemCount: number) => Promise<{ success: boolean; export?: ProjectExport; error?: string }>
  },
  delivery: {
    export: (projectId: number, photoIds: number[], targetDir: string, folderName: string, prefix: string) => Promise<{ success: boolean; folderPath?: string; copied: number; failed: number; results: { photoId: number; filename: string; targetPath: string; success: boolean; error?: string }[]; error?: string }>
    openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>
  },
  import: {
    fromDirectory: (dirPath: string, projectId?: number | null) => Promise<ImportResult>
    fromFiles: (filePaths: string[], projectId?: number | null) => Promise<ImportResult>
    fromDroppedPaths: (paths: string[], projectId?: number | null) => Promise<ImportResult>
    getProgress: () => Promise<ImportProgress>
    onProgress: (callback: (progress: ImportProgress) => void) => () => void
  }
  path: {
    join: (...paths: string[]) => Promise<string>
    appData: () => Promise<string>
    getPathForFile: (file: File) => string
  }
  tags: {
    getAll: () => Promise<Tag[]>
    create: (name: string, color?: string) => Promise<Tag | null>
    delete: (id: number) => Promise<boolean>
    getByPhoto: (photoId: number) => Promise<Tag[]>
    addToPhoto: (photoId: number, tagName: string) => Promise<IpcResponse<Tag>>
    removeFromPhoto: (photoId: number, tagId: number) => Promise<boolean>
  }
  exif: {
    getExifData: (filePath: string) => Promise<{ success: boolean; data?: ExifData; error?: string }>
    writeRating: (filePath: string, rating: number) => Promise<{ success: boolean; error?: string }>
    writeTags: (filePath: string, tags: string[]) => Promise<{ success: boolean; error?: string }>
    batchWriteTags: (filePaths: string[], tags: string[]) =>
      Promise<{ success: boolean; results: { filePath: string; success: boolean; error?: string }[] }>
    writeExifData: (filePath: string, data: Partial<ExifData>) => Promise<{ success: boolean; error?: string }>
  }
  capture: {
    captureScreen: (displayId: string, width: number, height: number) => Promise<{ success: boolean; data?: string; error?: string }>
    getConfig: () => Promise<{ success: boolean; data?: { displayId: string; physicalWidth: number; physicalHeight: number }; error?: string }>
    overlayReady: () => Promise<{ success: boolean; error?: string }>
    cancel: () => Promise<{ success: boolean; error?: string }>
    reportError: (error: string) => Promise<{ success: boolean; error?: string }>
    saveToLibrary: (payload: { imageData: Uint8Array }) => Promise<{ success: boolean; data?: { photoId: number; projectId: number; filePath: string; width: number; height: number; clipboardCopied: boolean; clipboardError?: string }; error?: string }>
    copyToClipboard: (payload: { imageData: Uint8Array }) => Promise<{ success: boolean; error?: string }>
    trigger: () => Promise<{ success: boolean; error?: string }>
    setTargetProject: (projectId: number | null) => Promise<{ success: boolean; error?: string }>
    getHotkeyStatus: () => Promise<{ success: boolean; data?: { hotkey: string; registered: boolean; conflict: boolean }; error?: string }>
    onSaved: (callback: (data: { projectId: number; photoId: number; photo?: Photo; clipboardCopied: boolean; clipboardError?: string }) => void) => () => void
    onError: (callback: (data: { error: string }) => void) => () => void
  },
  materialBrowser: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
    getDownloadDir: () => Promise<string>
    setDownloadDir: (dir: string) => Promise<{ success: boolean }>
    openDownloadDir: () => Promise<string>
    clearDownloadCache: () => Promise<{ success: boolean }>
    importToLibrary: (filePath: string, sourceUrl: string, tags: string[], projectId?: number | null) =>
      Promise<IpcResponse<{ photoId: number; photo?: unknown; alreadyImported: boolean }>>
    onDownloadStarted: (callback: (data: { id: string; fileName: string; filePath: string; totalBytes: number }) => void) => void
    onDownloadProgress: (callback: (data: { id: string; receivedBytes: number; totalBytes: number; percent: number }) => void) => void
    onDownloadComplete: (callback: (data: { id: string; fileName: string; filePath: string }) => void) => void
    onDownloadFailed: (callback: (data: { id: string; fileName: string; state: string }) => void) => void
  }
  projectReferences: {
    getAll: (projectId: number) => Promise<ProjectMaterialReference[]>
    add: (input: {
      projectId: number
      source: 'xiaohongshu' | 'douyin'
      sourceItemId?: string | null
      mediaType?: 'image' | 'gallery' | 'video' | 'link'
      title?: string | null
      author?: string | null
      originalUrl: string
      metadata?: Record<string, unknown> | null
    }) => Promise<{ reference?: ProjectMaterialReference; alreadyExists?: boolean; success?: boolean; error?: string }>
    remove: (projectId: number, referenceId: number) => Promise<{ success: boolean; error?: string }>
    export: (projectId: number, folderName: string) => Promise<{ success: boolean; filePath?: string; exported: number; failed: number; error?: string }>
  }
  projects: {
    getAll: () => Promise<Project[]>
    getById: (id: number) => Promise<Project | null>
    create: (name: string, description?: string) => Promise<{ success: boolean; id?: number; error?: string }>
    update: (id: number, name: string, description?: string) => Promise<{ success: boolean; error?: string }>
    updateBrief: (id: number, input: ProjectBriefInput) => Promise<{ success: boolean; error?: string }>
    duplicate: (id: number) => Promise<{ success: boolean; id?: number; name?: string; error?: string }>
    delete: (id: number) => Promise<{ success: boolean; targetProjectId?: number; targetProjectName?: string; movedPhotos?: number; error?: string }>
    movePhotos: (sourceProjectId: number, targetProjectId: number, photoIds: number[]) =>
      Promise<{ success: boolean; sourceProjectId?: number; targetProjectId?: number; movedPhotoIds?: number[]; skippedPhotoIds?: number[]; movedPhotos?: number; skippedPhotos?: number; error?: string }>
  }
  app: {
    getVersionInfo: () => Promise<{ name: string; version: string; electronVersion: string; chromeVersion: string; nodeVersion: string }>
    getChangelog: () => Promise<ChangelogEntry[]>
  }
  cache: {
    getStats: () => Promise<CacheStats>
    clearAll: () => Promise<CacheCleanResult>
    cleanOld: () => Promise<CacheCleanResult>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
}

const api: ElectronAPI = {
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: () => ipcRenderer.invoke('dialog:openFile')
  },
  photos: {
    getAll: (options?: PhotoQueryOptions) =>
      ipcRenderer.invoke('photos:getAll', options),
    count: (filter?: PhotoFilter) => ipcRenderer.invoke('photos:count', filter),
    getById: (id: number) => ipcRenderer.invoke('photos:getById', id),
    updateRating: (id: number, rating: number) => ipcRenderer.invoke('photos:updateRating', id, rating),
    setReviewState: (id: number, state: ReviewState) => ipcRenderer.invoke('photos:setReviewState', id, state),
    batchSetReviewState: (ids: number[], state: ReviewState) => ipcRenderer.invoke('photos:batchSetReviewState', ids, state),
    countByReviewState: (projectId: number) => ipcRenderer.invoke('photos:countByReviewState', projectId),
    updateTags: (id: number, tags: string[]) => ipcRenderer.invoke('photos:updateTags', id, tags),
    updateSourceNote: (id: number, note: string) => ipcRenderer.invoke('photos:updateSourceNote', id, note),
    toggleFavorite: (id: number) => ipcRenderer.invoke('photos:toggleFavorite', id),
    delete: (ids: number[]) => ipcRenderer.invoke('photos:delete', ids),
    restore: (ids: number[]) => ipcRenderer.invoke('photos:restore', ids),
    deletePermanently: (ids: number[]) => ipcRenderer.invoke('photos:deletePermanently', ids),
    getDeleted: (options?: PhotoQueryOptions) => ipcRenderer.invoke('photos:getDeleted', options),
    countDeleted: () => ipcRenderer.invoke('photos:countDeleted'),
    openInExplorer: (filePath: string) => ipcRenderer.invoke('photos:openInExplorer', filePath),
    generateThumbnails: () => ipcRenderer.invoke('photos:generateThumbnails'),
    getThumbnail: (id: number, size?: 'grid' | 'preview') => ipcRenderer.invoke('photos:getThumbnail', id, size),
    copyToDesktopFolder: (filePaths: string[], folderName: string) => ipcRenderer.invoke('photos:copyToDesktopFolder', filePaths, folderName),
    exportToPdf: (filePaths: string[], fileBaseName: string) => ipcRenderer.invoke('photos:exportToPdf', filePaths, fileBaseName),
    copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('photos:copyImageToClipboard', filePath)
  },
  selections: {
    getAll: (projectId: number) => ipcRenderer.invoke('selections:getAll', projectId),
    add: (projectId: number, photoId: number) => ipcRenderer.invoke('selections:add', projectId, photoId),
    remove: (projectId: number, photoId: number) => ipcRenderer.invoke('selections:remove', projectId, photoId),
    reorder: (projectId: number, photoIds: number[]) => ipcRenderer.invoke('selections:reorder', projectId, photoIds),
    updateMeta: (projectId: number, photoId: number, chapter: string, note: string) => ipcRenderer.invoke('selections:updateMeta', projectId, photoId, chapter, note)
  },
  shots: {
    getAll: (projectId: number) => ipcRenderer.invoke('shots:getAll', projectId),
    create: (projectId: number, photoId: number, input?: unknown) => ipcRenderer.invoke('shots:create', projectId, photoId, input),
    generateFromSelections: (projectId: number) => ipcRenderer.invoke('shots:generateFromSelections', projectId),
    update: (projectId: number, shotId: number, input: unknown) => ipcRenderer.invoke('shots:update', projectId, shotId, input),
    reorder: (projectId: number, shotIds: number[]) => ipcRenderer.invoke('shots:reorder', projectId, shotIds),
    remove: (projectId: number, shotId: number) => ipcRenderer.invoke('shots:remove', projectId, shotId)
  },
  planningExports: {
    getAll: (projectId: number) => ipcRenderer.invoke('planningExports:getAll', projectId),
    record: (projectId: number, kind: ProjectExport['kind'], targetPath: string, itemCount: number) => ipcRenderer.invoke('planningExports:record', projectId, kind, targetPath, itemCount)
  },
  delivery: {
    export: (projectId: number, photoIds: number[], targetDir: string, folderName: string, prefix: string) => ipcRenderer.invoke('delivery:export', projectId, photoIds, targetDir, folderName, prefix),
    openFolder: (folderPath: string) => ipcRenderer.invoke('delivery:openFolder', folderPath)
  },
  import: {
    fromDirectory: (dirPath: string, projectId?: number | null) =>
      ipcRenderer.invoke('import:fromDirectory', dirPath, projectId),
    fromFiles: (filePaths: string[], projectId?: number | null) =>
      ipcRenderer.invoke('import:fromFiles', filePaths, projectId),
    fromDroppedPaths: (paths: string[], projectId?: number | null) =>
      ipcRenderer.invoke('import:fromDroppedPaths', paths, projectId),
    getProgress: () => ipcRenderer.invoke('import:getProgress'),
    onProgress: (callback) => {
      const wrapped = (_event: unknown, data: ImportProgress) => callback(data)
      ipcRenderer.on('import:progress', wrapped)
      return () => ipcRenderer.removeListener('import:progress', wrapped)
    }
  },
  path: {
    join: (...paths: string[]) => ipcRenderer.invoke('path:join', ...paths),
    appData: () => ipcRenderer.invoke('path:appData'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (name: string, color?: string) => ipcRenderer.invoke('tags:create', name, color),
    delete: (id: number) => ipcRenderer.invoke('tags:delete', id),
    getByPhoto: (photoId: number) => ipcRenderer.invoke('tags:getByPhoto', photoId),
    addToPhoto: (photoId: number, tagName: string) => ipcRenderer.invoke('tags:addToPhoto', photoId, tagName),
    removeFromPhoto: (photoId: number, tagId: number) => ipcRenderer.invoke('tags:removeFromPhoto', photoId, tagId)
  },
  exif: {
    getExifData: (filePath: string) => ipcRenderer.invoke('exif:getExifData', filePath),
    writeRating: (filePath: string, rating: number) => ipcRenderer.invoke('exif:writeRating', filePath, rating),
    writeTags: (filePath: string, tags: string[]) => ipcRenderer.invoke('exif:writeTags', filePath, tags),
    batchWriteTags: (filePaths: string[], tags: string[]) => ipcRenderer.invoke('exif:batchWriteTags', filePaths, tags),
    writeExifData: (filePath: string, data: Partial<ExifData>) =>
      ipcRenderer.invoke('exif:writeExifData', filePath, data)
  },
  capture: {
    captureScreen: (displayId: string, width: number, height: number) =>
      ipcRenderer.invoke('capture:get-screen', displayId, width, height),
    getConfig: () => ipcRenderer.invoke('capture:get-config'),
    overlayReady: () => ipcRenderer.invoke('capture:overlay-ready'),
    cancel: () => ipcRenderer.invoke('capture:cancel'),
    reportError: (error: string) => ipcRenderer.invoke('capture:report-error', error),
    saveToLibrary: (payload: { imageData: Uint8Array }) => ipcRenderer.invoke('capture:save-to-library', payload),
    copyToClipboard: (payload: { imageData: Uint8Array }) => ipcRenderer.invoke('capture:copy-to-clipboard', payload),
    trigger: () => ipcRenderer.invoke('capture:trigger'),
    setTargetProject: (projectId: number | null) => ipcRenderer.invoke('capture:set-target-project', projectId),
    getHotkeyStatus: () => ipcRenderer.invoke('capture:get-hotkey-status'),
    onSaved: (callback) => {
      const wrapped = (_event: unknown, data: { projectId: number; photoId: number; photo?: Photo; clipboardCopied: boolean; clipboardError?: string }) => callback(data)
      ipcRenderer.on('capture:saved', wrapped)
      return () => ipcRenderer.removeListener('capture:saved', wrapped)
    },
    onError: (callback) => {
      const wrapped = (_event: unknown, data: { error: string }) => callback(data)
      ipcRenderer.on('capture:error', wrapped)
      return () => ipcRenderer.removeListener('capture:error', wrapped)
    }
  },
  materialBrowser: {
    openExternal: (url: string) => ipcRenderer.invoke('material-browser:open-external', url),
    getDownloadDir: () => ipcRenderer.invoke('material-browser:get-download-dir'),
    setDownloadDir: (dir: string) => ipcRenderer.invoke('material-browser:set-download-dir', dir),
    openDownloadDir: () => ipcRenderer.invoke('material-browser:open-download-dir'),
    clearDownloadCache: () => ipcRenderer.invoke('material-browser:clear-download-cache'),
    importToLibrary: (filePath: string, sourceUrl: string, tags: string[], projectId?: number | null) =>
      ipcRenderer.invoke('material-browser:import-to-library', filePath, sourceUrl, tags, projectId),
    onDownloadStarted: (callback) => ipcRenderer.on('material-browser:download-started', (_event, data) => callback(data)),
    onDownloadProgress: (callback) => ipcRenderer.on('material-browser:download-progress', (_event, data) => callback(data)),
    onDownloadComplete: (callback) => ipcRenderer.on('material-browser:download-complete', (_event, data) => callback(data)),
    onDownloadFailed: (callback) => ipcRenderer.on('material-browser:download-failed', (_event, data) => callback(data))
  },
  projectReferences: {
    getAll: (projectId: number) => ipcRenderer.invoke('project-references:getAll', projectId),
    add: (input) => ipcRenderer.invoke('project-references:add', input),
    remove: (projectId, referenceId) => ipcRenderer.invoke('project-references:remove', projectId, referenceId),
    export: (projectId, folderName) => ipcRenderer.invoke('project-references:export', projectId, folderName)
  },
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    getById: (id: number) => ipcRenderer.invoke('projects:getById', id),
    create: (name: string, description?: string) => ipcRenderer.invoke('projects:create', name, description),
    update: (id: number, name: string, description?: string) => ipcRenderer.invoke('projects:update', id, name, description),
    updateBrief: (id: number, input: ProjectBriefInput) => ipcRenderer.invoke('projects:updateBrief', id, input),
    duplicate: (id: number) => ipcRenderer.invoke('projects:duplicate', id),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id),
    movePhotos: (sourceProjectId: number, targetProjectId: number, photoIds: number[]) =>
      ipcRenderer.invoke('projects:movePhotos', sourceProjectId, targetProjectId, photoIds)
  },
  app: {
    getVersionInfo: () => ipcRenderer.invoke('app:getVersionInfo'),
    getChangelog: () => ipcRenderer.invoke('app:getChangelog')
  },
  cache: {
    getStats: () => ipcRenderer.invoke('cache:getStats'),
    clearAll: () => ipcRenderer.invoke('cache:clearAll'),
    cleanOld: () => ipcRenderer.invoke('cache:cleanOld')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
