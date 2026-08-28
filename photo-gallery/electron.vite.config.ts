import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-app/main',
      emptyOutDir: true,
      lib: {
        entry: 'electron/main.ts'
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-app/preload',
      emptyOutDir: true,
      lib: {
        entry: 'electron/preload.ts'
      }
    }
  },
  renderer: {
    root: '.',
    publicDir: 'public',
    build: {
      outDir: 'dist-app/renderer',
      emptyOutDir: true,
      rollupOptions: {
        input: 'public/index.html'
      }
    }
  }
})
