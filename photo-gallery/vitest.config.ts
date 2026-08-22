import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['electron/utils/**', 'electron/services/**']
    }
  },
  resolve: {
    alias: {
      '@electron': resolve(__dirname, 'electron')
    }
  }
})
