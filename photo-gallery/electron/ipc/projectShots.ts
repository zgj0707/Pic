import { ipcMain } from 'electron'
import { wrapHandler } from '../utils/ipcHandler'
import {
  createProjectShot,
  createShotsFromSelections,
  createShotGroup,
  listProjectShots,
  listShotGroups,
  removeShotGroup,
  removeProjectShot,
  renameShotGroup,
  reorderShotGroups,
  reorderProjectShots,
  updateProjectShot
} from '../services/projectShots'
import type { ProjectShotInput } from '../services/projectShots'

export function registerProjectShotsIpc(): void {
  ipcMain.handle('shotGroups:getAll', wrapHandler('shotGroups:getAll', (_event, projectId: number) => {
    return listShotGroups(projectId)
  }))

  ipcMain.handle('shotGroups:create', wrapHandler('shotGroups:create', (_event, projectId: number, input: { name: string }) => {
    return { success: true, group: createShotGroup(projectId, input) }
  }))

  ipcMain.handle('shotGroups:rename', wrapHandler('shotGroups:rename', (_event, projectId: number, groupId: number, name: string) => {
    return { success: true, group: renameShotGroup(projectId, groupId, name) }
  }))

  ipcMain.handle('shotGroups:reorder', wrapHandler('shotGroups:reorder', (_event, projectId: number, groupIds: number[]) => {
    return { success: true, groups: reorderShotGroups(projectId, groupIds) }
  }))

  ipcMain.handle('shotGroups:remove', wrapHandler('shotGroups:remove', (_event, projectId: number, groupId: number) => {
    return { success: removeShotGroup(projectId, groupId) }
  }))

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
