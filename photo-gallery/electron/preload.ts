import { contextBridge, ipcRenderer } from 'electron'
import type {
  Photo, PhotoQueryOptions, PhotoFilter, Tag, ExifData, Project,
  ImportResult, ImportProgress,
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
    updateTags: (id: number, tags: string[]) => Promise<{ success: boolean }>
    toggleFavorite: (id: number) => Promise<{ success: boolean }>
    delete: (ids: number[]) => Promise<{ success: boolean; moved?: number; error?: string }>
    restore: (ids: number[]) => Promise<{ success: boolean; restored?: number; error?: string }>
    deletePermanently: (ids: number[]) => Promise<{ success: boolean; error?: string }>
    getDeleted: (options?: PhotoQueryOptions) => Promise<Photo[]>
    countDeleted: () => Promise<number>
    openInExplorer: (filePath: string) => Promise<{ success: boolean }>
    generateThumbnails: () => Promise<{ success: boolean; generated: number }>
    getThumbnail: (id: number, size?: 'grid' | 'preview') => Promise<{ success: boolean; data?: { path: string }; error?: string }>
    copyToDesktopFolder: (filePaths: string[], folderName: string) =>
      Promise<{ success: boolean; folderPath?: string; copied?: number; failed?: number; error?: string }>
    copyImageToClipboard: (filePath: string) => Promise<{ success: boolean; error?: string }>
  }
  import: {
    fromDirectory: (dirPath: string, projectId?: number) => Promise<ImportResult>
    fromFiles: (filePaths: string[], projectId?: number) => Promise<ImportResult>
    getProgress: () => Promise<ImportProgress>
    onProgress: (callback: (progress: ImportProgress) => void) => () => void
  }
  path: {
    join: (...paths: string[]) => Promise<string>
    appData: () => Promise<string>
  }
  tags: {
    getAll: () => Promise<Tag[]>
    create: (name: string, color?: string) => Promise<Tag | null>
    delete: (id: number) => Promise<boolean>
    getByPhoto: (photoId: number) => Promise<Tag[]>
    addToPhoto: (photoId: number, tagName: string) => Promise<IpcResponse<Tag>>
    removeFromPhoto: (photoId: number, tagId: number) => Promise<boolean>
  }
  projects: {
    getAll: () => Promise<Project[]>
    getById: (id: number) => Promise<Project | null>
    create: (name: string, description?: string) => Promise<{ success: boolean; id?: number; error?: string }>
    update: (id: number, name: string, description?: string) => Promise<{ success: boolean; error?: string }>
    delete: (id: number) => Promise<{ success: boolean; error?: string }>
  }
  exif: {
    getExifData: (filePath: string) => Promise<{ success: boolean; data?: ExifData; error?: string }>
    writeRating: (filePath: string, rating: number) => Promise<{ success: boolean; error?: string }>
    writeTags: (filePath: string, tags: string[]) => Promise<{ success: boolean; error?: string }>
    batchWriteTags: (filePaths: string[], tags: string[]) =>
      Promise<{ success: boolean; results: { filePath: string; success: boolean; error?: string }[] }>
    writeExifData: (filePath: string, data: Partial<ExifData>) => Promise<{ success: boolean; error?: string }>
  }
  pdf: {
    saveToDesktop: (pdfData: string, filename: string) => Promise<IpcResponse<{ path: string }>>
  }
  materialBrowser: {
    getDownloadDir: () => Promise<string>
    setDownloadDir: (dir: string) => Promise<{ success: boolean }>
    openDownloadDir: () => Promise<string>
    clearDownloadCache: () => Promise<{ success: boolean }>
    saveScreenshot: (imageData: Buffer | string, filename: string) => Promise<IpcResponse<{ filePath: string }>>
    importToLibrary: (filePath: string, sourceUrl: string, tags: string[], projectId?: number) =>
      Promise<IpcResponse<{ photoId: number; photo?: unknown; alreadyImported: boolean }>>
    onDownloadStarted: (callback: (data: { id: string; fileName: string; filePath: string; totalBytes: number }) => void) => void
    onDownloadProgress: (callback: (data: { id: string; receivedBytes: number; totalBytes: number; percent: number }) => void) => void
    onDownloadComplete: (callback: (data: { id: string; fileName: string; filePath: string }) => void) => void
    onDownloadFailed: (callback: (data: { id: string; fileName: string; state: string }) => void) => void
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
    updateTags: (id: number, tags: string[]) => ipcRenderer.invoke('photos:updateTags', id, tags),
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
    copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('photos:copyImageToClipboard', filePath)
  },
  import: {
    fromDirectory: (dirPath: string, projectId?: number) => ipcRenderer.invoke('import:fromDirectory', dirPath, projectId),
    fromFiles: (filePaths: string[], projectId?: number) => ipcRenderer.invoke('import:fromFiles', filePaths, projectId),
    getProgress: () => ipcRenderer.invoke('import:getProgress'),
    onProgress: (callback) => {
      const wrapped = (_event: unknown, data: ImportProgress) => callback(data)
      ipcRenderer.on('import:progress', wrapped)
      return () => ipcRenderer.removeListener('import:progress', wrapped)
    }
  },
  path: {
    join: (...paths: string[]) => ipcRenderer.invoke('path:join', ...paths),
    appData: () => ipcRenderer.invoke('path:appData')
  },
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (name: string, color?: string) => ipcRenderer.invoke('tags:create', name, color),
    delete: (id: number) => ipcRenderer.invoke('tags:delete', id),
    getByPhoto: (photoId: number) => ipcRenderer.invoke('tags:getByPhoto', photoId),
    addToPhoto: (photoId: number, tagName: string) => ipcRenderer.invoke('tags:addToPhoto', photoId, tagName),
    removeFromPhoto: (photoId: number, tagId: number) => ipcRenderer.invoke('tags:removeFromPhoto', photoId, tagId)
  },
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    getById: (id: number) => ipcRenderer.invoke('projects:getById', id),
    create: (name: string, description?: string) => ipcRenderer.invoke('projects:create', name, description),
    update: (id: number, name: string, description?: string) => ipcRenderer.invoke('projects:update', id, name, description),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id)
  },
  exif: {
    getExifData: (filePath: string) => ipcRenderer.invoke('exif:getExifData', filePath),
    writeRating: (filePath: string, rating: number) => ipcRenderer.invoke('exif:writeRating', filePath, rating),
    writeTags: (filePath: string, tags: string[]) => ipcRenderer.invoke('exif:writeTags', filePath, tags),
    batchWriteTags: (filePaths: string[], tags: string[]) => ipcRenderer.invoke('exif:batchWriteTags', filePaths, tags),
    writeExifData: (filePath: string, data: Partial<ExifData>) =>
      ipcRenderer.invoke('exif:writeExifData', filePath, data)
  },
  pdf: {
    saveToDesktop: (pdfData: string, filename: string) => ipcRenderer.invoke('pdf:saveToDesktop', pdfData, filename)
  },
  materialBrowser: {
    getDownloadDir: () => ipcRenderer.invoke('material-browser:get-download-dir'),
    setDownloadDir: (dir: string) => ipcRenderer.invoke('material-browser:set-download-dir', dir),
    openDownloadDir: () => ipcRenderer.invoke('material-browser:open-download-dir'),
    clearDownloadCache: () => ipcRenderer.invoke('material-browser:clear-download-cache'),
    saveScreenshot: (imageData: Buffer | string, filename: string) => ipcRenderer.invoke('material-browser:save-screenshot', imageData, filename),
    importToLibrary: (filePath: string, sourceUrl: string, tags: string[], projectId?: number) => ipcRenderer.invoke('material-browser:import-to-library', filePath, sourceUrl, tags, projectId),
    onDownloadStarted: (callback) => ipcRenderer.on('material-browser:download-started', (_event, data) => callback(data)),
    onDownloadProgress: (callback) => ipcRenderer.on('material-browser:download-progress', (_event, data) => callback(data)),
    onDownloadComplete: (callback) => ipcRenderer.on('material-browser:download-complete', (_event, data) => callback(data)),
    onDownloadFailed: (callback) => ipcRenderer.on('material-browser:download-failed', (_event, data) => callback(data))
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
