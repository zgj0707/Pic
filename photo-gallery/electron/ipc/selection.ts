import { ipcMain } from 'electron'
import { wrapHandler } from '../utils/ipcHandler'
import {
  addProjectSelection,
  listProjectSelections,
  removeProjectSelection,
  reorderProjectSelections,
  updateProjectSelectionMeta
} from '../services/projectSelections'

export function registerSelectionIpc(): void {
  ipcMain.handle('selections:getAll', wrapHandler('selections:getAll', (_event, projectId: number) => {
    return listProjectSelections(projectId)
  }))

  ipcMain.handle('selections:add', wrapHandler('selections:add', (_event, projectId: number, photoId: number) => {
    const selection = addProjectSelection(projectId, photoId)
    return { success: true, selection }
  }))

  ipcMain.handle('selections:remove', wrapHandler('selections:remove', (_event, projectId: number, photoId: number) => {
    return { success: removeProjectSelection(projectId, photoId) }
  }))

  ipcMain.handle('selections:reorder', wrapHandler('selections:reorder', (_event, projectId: number, photoIds: number[]) => {
    const selections = reorderProjectSelections(projectId, photoIds)
    return { success: true, selections }
  }))

  ipcMain.handle('selections:updateMeta', wrapHandler('selections:updateMeta', (_event, projectId: number, photoId: number, chapter: string, note: string) => {
    const selection = updateProjectSelectionMeta(projectId, photoId, chapter, note)
    return { success: true, selection }
  }))
}
