import { ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { wrapHandler } from '../utils/ipcHandler'
import { exportProjectDelivery } from '../services/delivery'

export function registerDeliveryIpc(): void {
  ipcMain.handle('delivery:export', wrapHandler('delivery:export', (_event, projectId: number, photoIds: number[], targetDir: string, folderName: string, prefix: string) => {
    return exportProjectDelivery(projectId, photoIds, targetDir, folderName, prefix)
  }))

  ipcMain.handle('delivery:openFolder', wrapHandler('delivery:openFolder', (_event, folderPath: string) => {
    if (!folderPath || !existsSync(folderPath)) return { success: false, error: '方案目录不存在' }
    shell.openPath(folderPath)
    return { success: true }
  }))
}