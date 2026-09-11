/**
 * File: tools/board-editor/vite.config.mjs
 * Dev-server config for the board editor.
 *
 * The editor is a separate app that reuses the configurator's own
 * source: `@` points at the configurator's src, so the preview pane
 * renders through the very component the app ships
 * (src/components/boardview/BoardViewCanvas.svelte) rather than a
 * lookalike. If the drawing is wrong in the editor it is wrong in the
 * app, which is the point.
 *
 * Run it with `pnpm board-editor` from the configurator root.
 */

import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import boardEditorApi from "./server/api.mjs";

const here = import.meta.dirname;
const repoRoot = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  // Its own dependency cache. Sharing node_modules/.vite with the app
  // makes each server invalidate the other's optimised deps, and the
  // app then serves 504s until it is restarted.
  cacheDir: path.resolve(here, "node_modules/.vite"),
  plugins: [
    // The configurator's own Svelte settings, so a component behaves
    // here exactly as it does in the app.
    svelte({ configFile: path.resolve(repoRoot, "svelte.config.mjs") }),
    boardEditorApi({ repoRoot }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(repoRoot, "src"),
      "~editor": path.resolve(here, "src"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        additionalData: '@use "@/css/global.scss" as g;\n',
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify("board-editor"),
    __BUILD_LABEL__: JSON.stringify("board-editor"),
    __BACKEND__: JSON.stringify("web"),
    __COMMIT_HASH__: JSON.stringify("board-editor"),
  },
  server: {
    port: 5078,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
});
