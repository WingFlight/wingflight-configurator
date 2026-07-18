import pkg from "./package.json" with { type: "json" };

import child_process from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const commitHash = child_process
  .execSync("git rev-parse --short HEAD")
  .toString()
  .trim();

const getBackend = () => {
  const mode = process.env.VITE_APP_BACKEND || "nwjs";
  if (["nwjs", "cordova", "web"].includes(mode)) {
    return mode;
  }
  console.warn(`Unknown backend "${mode}", defaulting to "nwjs"`);
  return "nwjs";
};

const getBasePath = (backend) => {
  if (backend === "web") {
    if (process.env.VITE_APP_VERSION) {
      return `/${pkg.name}/${process.env.VITE_APP_VERSION}/`;
    }

    return `/${pkg.name}/`;
  }

  return "./";
};

const backend = getBackend();
const basePath = getBasePath(backend);

const publicAssetPrefixes = [
  "images",
  "locales",
  "libraries",
  "node_modules",
  "fontawesome",
  "fonts",
  "opensans_webfontkit",
];

const legacyBrowserScripts = [
  ["node_modules/lru_map/lru.js", "node_modules/lru_map/lru.js"],
  [
    "node_modules/jquery/dist/jquery.min.js",
    "node_modules/jquery/dist/jquery.min.js",
  ],
  ["node_modules/jbox/dist/jBox.min.js", "node_modules/jbox/dist/jBox.min.js"],
  [
    "node_modules/jquery-ui-npm/jquery-ui.min.js",
    "node_modules/jquery-ui-npm/jquery-ui.min.js",
  ],
  [
    "node_modules/switchery-latest/dist/switchery.min.js",
    "node_modules/switchery-latest/dist/switchery.min.js",
  ],
  [
    "node_modules/jquery-textcomplete/dist/jquery.textcomplete.min.js",
    "node_modules/jquery-textcomplete/dist/jquery.textcomplete.min.js",
  ],
  [
    "node_modules/jquery-touchswipe/jquery.touchSwipe.min.js",
    "node_modules/jquery-touchswipe/jquery.touchSwipe.min.js",
  ],
  [
    "node_modules/select2/dist/js/select2.min.js",
    "node_modules/select2/dist/js/select2.min.js",
  ],
];

const publicSymlinkTargets = [
  ["images", "src/images"],
  ["libraries", "libraries"],
  ["locales", "locales"],
  ["fontawesome", "public/fontawesome"],
];

const mimeTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewritePublicAssetUrls(content, { css = false } = {}) {
  const assetBase = css
    ? basePath === "./"
      ? "../"
      : basePath
    : basePath === "./"
      ? ""
      : basePath;

  return publicAssetPrefixes.reduce((result, prefix) => {
    const from = `/${prefix}/`;
    const to = `${assetBase}${prefix}/`;

    if (!assetBase) {
      return result.replaceAll(from, to);
    }

    const matcher = new RegExp(
      `(?<!${escapeRegExp(assetBase)})/${prefix}/`,
      "g",
    );
    return result.replace(matcher, to);
  }, content);
}

function rewriteInlineCssDataUris(html) {
  return html.replace(
    /data:text\/css;base64,([A-Za-z0-9+/=]+)/g,
    (_, encodedCss) => {
      const decodedCss = Buffer.from(encodedCss, "base64").toString("utf8");
      const rewrittenCss = rewritePublicAssetUrls(decodedCss, { css: true });
      const encodedRewrittenCss = Buffer.from(rewrittenCss, "utf8").toString(
        "base64",
      );
      return `data:text/css;base64,${encodedRewrittenCss}`;
    },
  );
}

function normalizeDuplicateBasePath(content) {
  if (basePath === "./") {
    return content;
  }

  const normalizedBasePath = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  const duplicatePrefix = `${normalizedBasePath}${normalizedBasePath}`;

  return content.replaceAll(duplicatePrefix, normalizedBasePath);
}

function createSymlinkTargetMiddleware(root) {
  const normalizedBasePath = basePath === "./" ? "/" : basePath;

  return function serveSymlinkTarget(req, res, next) {
    const requestUrl = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(requestUrl.pathname);

    if (normalizedBasePath !== "/" && pathname.startsWith(normalizedBasePath)) {
      pathname = `/${pathname.slice(normalizedBasePath.length)}`;
    }

    const target = publicSymlinkTargets.find(([publicPath]) =>
      pathname.startsWith(`/${publicPath}/`),
    );
    if (!target) {
      next();
      return;
    }

    const [publicPath, sourcePath] = target;
    const relativePath = pathname.slice(publicPath.length + 2);
    const sourceRoot = path.resolve(root, sourcePath);
    const filePath = path.resolve(sourceRoot, relativePath);

    if (
      !filePath.startsWith(`${sourceRoot}${path.sep}`) ||
      !fsSync.existsSync(filePath) ||
      !fsSync.statSync(filePath).isFile()
    ) {
      next();
      return;
    }

    res.setHeader(
      "Content-Type",
      mimeTypes.get(path.extname(filePath).toLowerCase()) ||
        "application/octet-stream",
    );
    fsSync.createReadStream(filePath).pipe(res);
  };
}

async function copySymlinkTargetsToBundle() {
  await Promise.all(
    publicSymlinkTargets.map(async ([publicPath, sourcePath]) => {
      const sourceRoot = path.resolve(sourcePath);
      const targetRoot = path.resolve("bundle", publicPath);

      try {
        const sourceStats = await fs.stat(sourceRoot);
        if (!sourceStats.isDirectory()) {
          return;
        }
      } catch {
        return;
      }

      await fs.rm(targetRoot, { force: true, recursive: true });
      await fs.mkdir(path.dirname(targetRoot), { recursive: true });
      await fs.cp(sourceRoot, targetRoot, { recursive: true });
    }),
  );
}

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
        server.middlewares.use(
          createSymlinkTargetMiddleware(server.config.root),
        );

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
      name: "rewrite-dev-public-asset-urls",
      apply: "serve",
      transform(code, id) {
        if (!/\.(css|scss|html|js|svelte)(\?|$)/.test(id)) {
          return null;
        }

        const rewrittenCode = rewritePublicAssetUrls(code);
        if (rewrittenCode === code) {
          return null;
        }

        return {
          code: rewrittenCode,
          map: null,
        };
      },
    },
    {
      name: "web-html-cleanup",
      apply: "build",
      transformIndexHtml: {
        handler(html) {
          if (backend === "web") {
            html = html.replace(
              /<link[^>]*href=["']\/src\/css\/[^"']*["'][^>]*>\s*/g,
              "",
            );
            html = html.replace(
              /<link[^>]*href=["']\/node_modules\/[^"']*\.css["'][^>]*>\s*/g,
              "",
            );
          }

          return html;
        },
      },
    },
    {
      name: "copy-public-symlink-targets",
      apply: "build",
      async writeBundle() {
        await copySymlinkTargetsToBundle();
      },
    },
    {
      name: "rewrite-public-asset-urls",
      apply: "build",
      async writeBundle(_, bundle) {
        await Promise.all(
          Object.values(bundle).map(async (output) => {
            if (output.type !== "asset" && output.type !== "chunk") {
              return;
            }

            if (!/\.(html|css|js)$/.test(output.fileName)) {
              return;
            }

            const filePath = path.resolve("bundle", output.fileName);
            const fileContent = await fs.readFile(filePath, "utf8");
            let rewrittenContent = rewritePublicAssetUrls(fileContent, {
              css: output.fileName.endsWith(".css"),
            });

            if (output.fileName.endsWith(".html")) {
              rewrittenContent = rewriteInlineCssDataUris(rewrittenContent);
            }

            rewrittenContent = normalizeDuplicateBasePath(rewrittenContent);

            if (rewrittenContent !== fileContent) {
              await fs.writeFile(filePath, rewrittenContent);
            }
          }),
        );
      },
    },
    {
      name: "copy-legacy-browser-scripts",
      apply: "build",
      async writeBundle() {
        await Promise.all(
          legacyBrowserScripts.map(async ([sourcePath, targetPath]) => {
            const sourceFile = path.resolve(sourcePath);
            const targetFile = path.resolve("bundle", targetPath);
            await fs.mkdir(path.dirname(targetFile), { recursive: true });
            await fs.copyFile(sourceFile, targetFile);
          }),
        );
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
