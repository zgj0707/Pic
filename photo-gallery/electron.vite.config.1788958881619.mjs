// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-app/main",
      emptyOutDir: true,
      lib: {
        entry: "electron/main.ts"
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-app/preload",
      emptyOutDir: true,
      lib: {
        entry: "electron/preload.ts"
      }
    }
  },
  renderer: {
    root: ".",
    publicDir: "public",
    build: {
      outDir: "dist-app/renderer",
      emptyOutDir: true,
      rollupOptions: {
        input: "public/index.html"
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
