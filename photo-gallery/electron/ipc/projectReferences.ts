import { ipcMain } from 'electron'
import { wrapHandler } from '../utils/ipcHandler'
import {
  addProjectMaterialReference,
  exportProjectMaterialReferences,
  listProjectMaterialReferences,
  removeProjectMaterialReference
} from '../services/projectReferences'
import type { MaterialMediaType, MaterialSource } from '../services/materialSources'

export function registerProjectReferencesIpc(desktopPath?: string): void {
  ipcMain.handle('project-references:getAll', wrapHandler('project-references:getAll', (_event, projectId: number) => {
    return listProjectMaterialReferences(projectId)
  }))

  ipcMain.handle('project-references:add', wrapHandler('project-references:add', (_event, input: {
    projectId: number
    source: MaterialSource
    sourceItemId?: string | null
    mediaType?: MaterialMediaType
    title?: string | null
    author?: string | null
    originalUrl: string
    metadata?: Record<string, unknown> | null
  }) => {
    return addProjectMaterialReference(input)
  }))

  ipcMain.handle('project-references:remove', wrapHandler('project-references:remove', (_event, projectId: number, referenceId: number) => {
    return { success: removeProjectMaterialReference(projectId, referenceId) }
  }))

  ipcMain.handle('project-references:export', wrapHandler('project-references:export', (_event, projectId: number, folderName: string) => {
    if (!desktopPath) return { success: false, exported: 0, failed: 0, error: '桌面路径不可用' }
    return exportProjectMaterialReferences(projectId, folderName, desktopPath)
  }))
}
