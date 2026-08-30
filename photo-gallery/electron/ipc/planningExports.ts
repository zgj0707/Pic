import { ipcMain } from 'electron'
import { wrapAsyncHandler, wrapHandler } from '../utils/ipcHandler'
import { exportProjectPlanningPdf, listProjectExports, preflightProjectPlanningPdf, recordProjectExport } from '../services/planningExports'
import type { PlanningExportKind } from '../services/planningExports'
import type { PlanningPdfExportContext } from '../services/planningExports'

export function registerPlanningExportsIpc(context: PlanningPdfExportContext): void {
  ipcMain.handle('planningExports:getAll', wrapHandler('planningExports:getAll', (_event, projectId: number) => {
    return listProjectExports(projectId)
  }))

  ipcMain.handle('planningExports:record', wrapHandler('planningExports:record', (_event, projectId: number, kind: PlanningExportKind, targetPath: string, itemCount: number) => {
    return { success: true, export: recordProjectExport(projectId, kind, targetPath, itemCount) }
  }))

  ipcMain.handle('planningExports:preflight', wrapHandler('planningExports:preflight', (_event, projectId: number) => {
    return preflightProjectPlanningPdf(projectId)
  }))

  ipcMain.handle('planningExports:exportPdf', wrapAsyncHandler('planningExports:exportPdf',
    async (_event, projectId: number, fileBaseName: string) => exportProjectPlanningPdf(projectId, fileBaseName, context)
  ))
}
