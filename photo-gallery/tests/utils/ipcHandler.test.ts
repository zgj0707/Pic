import { describe, it, expect } from 'vitest'
import { wrapHandler, wrapAsyncHandler } from '../../electron/utils/ipcHandler'

describe('wrapHandler (sync)', () => {
  it('should pass through the return value on success', () => {
    const handler = wrapHandler('test:sync', (x: number) => x * 2)
    expect(handler(5)).toBe(10)
  })

  it('should return error response when handler throws', () => {
    const handler = wrapHandler('test:throw', () => {
      throw new Error('Sync failure')
    })
    const result = handler()
    expect(result.success).toBe(false)
    expect(result.error).toBe('Sync failure')
  })

  it('should handle non-Error thrown values', () => {
    const handler = wrapHandler('test:string', () => {
      throw 'String error'
    })
    const result = handler()
    expect(result.success).toBe(false)
    expect(result.error).toBe('String error')
  })

  it('should pass through all arguments', () => {
    const handler = wrapHandler('test:args', (a: number, b: string, c: boolean) => {
      return { a, b, c }
    })
    const result = handler(1, 'hello', true)
    expect(result).toEqual({ a: 1, b: 'hello', c: true })
  })

  it('should handle handlers that return null', () => {
    const handler = wrapHandler('test:null', () => null)
    expect(handler()).toBeNull()
  })

  it('should handle handlers that return arrays', () => {
    const handler = wrapHandler('test:array', () => [1, 2, 3])
    const result = handler()
    expect(result).toEqual([1, 2, 3])
  })
})

describe('wrapAsyncHandler (async)', () => {
  it('should pass through the resolved value on success', async () => {
    const handler = wrapAsyncHandler('test:async', async (x: number) => x * 2)
    const result = await handler(5)
    expect(result).toBe(10)
  })

  it('should return error response when handler rejects', async () => {
    const handler = wrapAsyncHandler('test:reject', async () => {
      throw new Error('Async failure')
    })
    const result = await handler()
    expect(result.success).toBe(false)
    expect(result.error).toBe('Async failure')
  })

  it('should handle non-Error rejection values', async () => {
    const handler = wrapAsyncHandler('test:reject-str', async () => {
      throw { code: 500, message: 'Server error' }
    })
    const result = await handler()
    expect(result.success).toBe(false)
    // String({ code: 500, message: 'Server error' }) === '[object Object]'
    expect(result.error).toBe('[object Object]')
  })

  it('should pass through all arguments to async handler', async () => {
    const handler = wrapAsyncHandler('test:args', async (a: number, b: string) => {
      return { sum: a + b.length, label: b }
    })
    const result = await handler(5, 'test')
    expect(result).toEqual({ sum: 9, label: 'test' })
  })

  it('should handle async handlers that return null', async () => {
    const handler = wrapAsyncHandler('test:null', async () => null)
    const result = await handler()
    expect(result).toBeNull()
  })

  it('should handle async handlers that return arrays', async () => {
    const handler = wrapAsyncHandler('test:array', async () => [1, 2, 3])
    const result = await handler()
    expect(result).toEqual([1, 2, 3])
  })
})
