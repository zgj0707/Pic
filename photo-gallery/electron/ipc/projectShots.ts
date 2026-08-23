import { ipcMain } from 'electron'
import { wrapHandler } from '../utils/ipcHandler'
import {
  createProjectShot,
  createShotsFromSelections,
  listProjectShots,
  removeProjectShot,
  reorderProjectShots,
  updateProjectShot
} from '../services/projectShots'
import type { ProjectShotInput } from '../services/projectShots'

export function registerProjectShotsIpc(): void {
  ipcMain.handle('shots:getAll', wrapHandler('shots:getAll', (_event, projectId: number) => {
    return listProjectShots(projectId)
  }))

  ipcMain.handle('shots:create', wrapHandler('shots:create', (_event, projectId: number, photoId: number, input?: ProjectShotInput) => {
    return { success: true, shot: createProjectShot(projectId, photoId, input) }
  }))

  ipcMain.handle('shots:generateFromSelections', wrapHandler('shots:generateFromSelections', (_event, projectId: number) => {
    return { success: true, shots: createShotsFromSelections(projectId) }
  }))

  ipcMain.handle('shots:update', wrapHandler('shots:update', (_event, projectId: number, shotId: number, input: ProjectShotInput) => {
    return { success: true, shot: updateProjectShot(projectId, shotId, input) }
  }))

  ipcMain.handle('shots:reorder', wrapHandler('shots:reorder', (_event, projectId: number, shotIds: number[]) => {
    return { success: true, shots: reorderProjectShots(projectId, shotIds) }
  }))

  ipcMain.handle('shots:remove', wrapHandler('shots:remove', (_event, projectId: number, shotId: number) => {
    return { success: removeProjectShot(projectId, shotId) }
  }))
}