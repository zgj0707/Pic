import { ipcMain } from 'electron'
import { exportPhotosToPdf } from '../services/pdfExport'
import { wrapAsyncHandler } from '../utils/ipcHandler'

export interface PdfExportContext {
  app: { getPath(name: string): string }
}

export function registerPdfExportIpc(context: PdfExportContext): void {
  ipcMain.handle('photos:exportToPdf', wrapAsyncHandler('photos:exportToPdf',
    async (_event, filePaths: string[], fileBaseName: string) =>
      exportPhotosToPdf(filePaths, fileBaseName, context.app.getPath('desktop'))
  ))
}
