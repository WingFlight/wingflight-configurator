import pkg from "./package.json" with { type: "json" };

import child_process from "node:child_process";
import path from "node:path";

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const commitHash = child_process
  .execSync("git rev-parse --short HEAD")
  .toString()
  .trim();

// Determine backend from environment or command-line mode
const getBackend = () => {
  const mode = process.env.VITE_APP_BACKEND || "nwjs";
  if (["nwjs", "cordova", "web"].includes(mode)) {
    return mode;
  }
  console.warn(`Unknown backend "${mode}", defaulting to "nwjs"`);
  return "nwjs";
};

// Determine base path for deployment
const getBasePath = () => {
  if (process.env.VITE_APP_VERSION) {
    return `/${process.env.VITE_APP_VERSION}/`;
  }
  return "./";
};

const backend = getBackend();
const basePath = getBasePath();

export default defineConfig({
  base: basePath,
  build: {
    target: "chrome119",
    outDir: "./bundle",
    chunkSizeWarningLimit: 1024 * 1024,
    rollupOptions: {
      input: {
        "index.html": "index.html",
        "src/main_cordova.html": "src/main_cordova.html",
        "src/tabs/receiver_msp.html": "src/tabs/receiver_msp.html",
        "src/tabs/map.html": "src/tabs/map.html",
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
        manualChunks(id) {
          if (id.includes("node_modules/d3")) {
            return "vendor-d3";
          }
          if (id.includes("node_modules/three")) {
            return "vendor-three";
          }
        },
      },
    },
  },
  plugins: [
    svelte(),
    {
      name: "suppress-sourcemap-warnings",
      apply: "serve",
      configResolved(config) {
        // Suppress source map warnings for node_modules in dev server
        const logger = config.logger;
        const originalWarn = logger.warn;
        logger.warn = (msg, options) => {
          if (
            typeof msg === "string" &&
            msg.includes("Failed to load source map")
          ) {
            return;
          }
          originalWarn(msg, options);
        };
      },
    },
    {
      name: "locale-watch",
      configureServer(server) {
        server.watcher.on("change", (file) => {
          const relative = path.relative(server.config.root, file);
          const match = relative.match(
            /^public\/locales\/(.+)\/messages.json$/,
          );
          if (match) {
            server.ws.send("locale-change", match[1]);
          }
        });
      },
    },
    {
      name: "web-html-cleanup",
      apply: "serve",
      transformIndexHtml: {
        handler(html) {
          // For web backend, remove CSS link tags that are imported in main.svelte.js
          // Keep public asset links (fonts, fontawesome, libraries)
          if (backend === "web") {
            // Remove stylesheet links for /src/css/ paths (being imported as JS modules)
            html = html.replace(
              /<link[^>]*href=["']\/src\/css\/[^"']*["'][^>]*>/g,
              "",
            );
            // Remove stylesheet links for /node_modules/ CSS (being imported in JS)
            html = html.replace(
              /<link[^>]*href=["']\/node_modules\/[^"']*\.css["'][^>]*>/g,
              "",
            );
          }
          return html;
        },
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
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
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BACKEND__: JSON.stringify(backend),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  server: {
    port: 5077,
    strictPort: true,
  },
});
