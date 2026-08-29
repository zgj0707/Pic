import { ipcMain } from 'electron'
import { wrapHandler } from '../utils/ipcHandler'
import { listProjectExports, recordProjectExport } from '../services/planningExports'
import type { PlanningExportKind } from '../services/planningExports'

export function registerPlanningExportsIpc(): void {
  ipcMain.handle('planningExports:getAll', wrapHandler('planningExports:getAll', (_event, projectId: number) => {
    return listProjectExports(projectId)
  }))

  ipcMain.handle('planningExports:record', wrapHandler('planningExports:record', (_event, projectId: number, kind: PlanningExportKind, targetPath: string, itemCount: number) => {
    return { success: true, export: recordProjectExport(projectId, kind, targetPath, itemCount) }
  }))
}