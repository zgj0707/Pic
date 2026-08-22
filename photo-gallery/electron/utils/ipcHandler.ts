/**
 * Unified IPC error handling — the "error boundary" for all IPC channels.
 *
 * Before this module, error handling was scattered across every IPC
 * handler file: some had try-catch, some didn't, and the ones that did
 * all used the same ad-hoc pattern:
 *
 *   try { ... } catch (e) { return { success: false, error: String(e) } }
 *
 * This module provides `wrapHandler` / `wrapAsyncHandler` wrappers that
 * standardize the pattern. Every IPC handler that goes through these
 * wrappers will:
 *   1. Never throw an unhandled exception to the renderer process
 *   2. Return a consistent { success: false, error } shape on failure
 *   3. Log the error with the channel name for debugging
 *
 * Usage:
 *   ipcMain.handle('photos:getAll', wrapAsyncHandler('photos:getAll',
 *     async (_event, options?: PhotoQueryOptions) => { ... }
 *   ))
 */

import type { IpcErrorResponse } from '../types'

/**
 * Wrap a synchronous IPC handler with unified error handling.
 * If the handler throws, the error is caught, logged, and returned
 * as { success: false, error }.
 */
export function wrapHandler<T extends (...args: any[]) => any>(
  channel: string,
  handler: T
): (...args: Parameters<T>) => ReturnType<T> | IpcErrorResponse {
  return (...args: Parameters<T>) => {
    try {
      return handler(...args)
    } catch (error) {
      console.error(`[IPC:${channel}] Error:`, error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/**
 * Wrap an async IPC handler with unified error handling.
 * If the handler's promise rejects, the error is caught, logged,
 * and returned as { success: false, error }.
 */
export function wrapAsyncHandler<T extends (...args: any[]) => Promise<any>>(
  channel: string,
  handler: T
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | IpcErrorResponse> {
  return async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      console.error(`[IPC:${channel}] Error:`, error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/**
 * Check if a file exists, returning an error response if not.
 * Convenience helper for file-based IPC handlers.
 */
export function requireFileExists(filePath: string): { ok: true } | { ok: false; error: string } {
  const { existsSync } = require('fs')
  if (!existsSync(filePath)) {
    return { ok: false, error: '文件不存在' }
  }
  return { ok: true }
}
