import { ipcMain, shell } from 'electron'
import { wrapHandler } from '../utils/ipcHandler'

export function registerDeleteIpc(): void {
  ipcMain.handle('photos:openInExplorer', wrapHandler('photos:openInExplorer',
    (_event, filePath: string) => {
      shell.showItemInFolder(filePath)
      return { success: true }
    }
  ))
}
