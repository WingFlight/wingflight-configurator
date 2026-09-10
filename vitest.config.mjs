import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@": path.resolve("src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
    __BUILD_LABEL__: JSON.stringify("test"),
    __BACKEND__: JSON.stringify("web"),
    __COMMIT_HASH__: JSON.stringify("test"),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.js"],
    include: ["test/**/*.test.js"],
  },
});
