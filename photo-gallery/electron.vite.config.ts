import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-app/main',
      emptyOutDir: false,
      lib: {
        entry: 'electron/main.ts'
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-app/preload',
      emptyOutDir: false,
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
      emptyOutDir: false,
      rollupOptions: {
        input: 'public/index.html'
      }
    }
  }
})
