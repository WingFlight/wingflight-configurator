/**
 * File: tools/board-editor/server/api.mjs
 * The board editor's dev-server side: a small Vite plugin that lets
 * the editor read and write the files the configurator ships, and
 * fetches the unified target catalogue on its behalf.
 *
 * It is deliberately narrow. Only two places are writable -- the
 * profile file and the board images directory -- plus a cache
 * directory of its own, and every path is resolved and checked against
 * its root before use, so a crafted request cannot walk out of the
 * repository.
 *
 * The catalogue is WingFlight/wingflight-targets, the same repository
 * the Firmware Flasher loads boards from. Fetching it here rather than
 * in the browser keeps the GitHub calls on one host and lets the
 * answers be cached on disk, so the editor keeps working offline once
 * it has been primed.
 *
 * Routes:
 *   GET  /api/profiles           the profile file, verbatim
 *   PUT  /api/profiles           replace it (formatted, 2-space JSON)
 *   GET  /api/backgrounds        the SVGs already in src/images/boards
 *   POST /api/backgrounds/<name> save an SVG there
 *   GET  /api/targets            the catalogue listing (cached)
 *   GET  /api/targets/<id>       one target's .config text (cached)
 *   GET  /images/...             src/images, the way the app serves it
 *
 * Both target routes take `?refresh=1` to bypass the cache.
 */

import fs from "node:fs/promises";
import path from "node:path";

const PROFILE_RELATIVE = "src/tabs/journey/board_profiles.json";
const IMAGES_RELATIVE = "src/images";
const BOARDS_RELATIVE = "src/images/boards";

/** The unified target catalogue. */
const TARGETS_REPO = "WingFlight/wingflight-targets";
const TARGETS_BRANCH = "master";
const TARGETS_DIR = "configs";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** How long a cached catalogue listing is served before refetching. */
const LISTING_TTL_MS = 6 * 60 * 60 * 1000;

/** Resolves `relative` under `root`, refusing anything that escapes it. */
function resolveWithin(root, relative) {
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes its root: ${relative}`);
  }
  return resolved;
}

function send(res, status, body, type = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// --- the target catalogue ---------------------------------------------

/**
 * A disk cache under the tool's own directory. It exists so the editor
 * is usable on a train: the catalogue is 400-odd small files that
 * change rarely, and refetching all of them to redraw one board would
 * be rude to GitHub as well as slow.
 */
function makeCache(cacheRoot) {
  const ensure = () => fs.mkdir(cacheRoot, { recursive: true });

  return {
    async read(name) {
      try {
        const file = resolveWithin(cacheRoot, name);
        const [text, stat] = await Promise.all([
          fs.readFile(file, "utf8"),
          fs.stat(file),
        ]);
        return { text, ageMs: Date.now() - stat.mtimeMs };
      } catch {
        return null;
      }
    },
    async write(name, text) {
      await ensure();
      await fs.writeFile(resolveWithin(cacheRoot, name), text, "utf8");
    },
  };
}

/**
 * The catalogue listing, as rows of `{name, path, download_url}`.
 * Served from cache unless it is stale or a refresh was asked for; a
 * failed fetch falls back to whatever is cached, however old, because
 * a stale list beats no list.
 */
async function fetchListing(cache, { refresh }) {
  const cached = await cache.read("targets.json");
  if (cached && !refresh && cached.ageMs < LISTING_TTL_MS) {
    return { text: cached.text, source: "cache" };
  }

  try {
    const url = `https://api.github.com/repos/${TARGETS_REPO}/contents/${TARGETS_DIR}?ref=${TARGETS_BRANCH}`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const entries = await res.json();
    if (!Array.isArray(entries)) throw new Error("Unexpected listing shape");
    const text = JSON.stringify(
      entries.map(({ name, path: filePath, download_url }) => ({
        name,
        path: filePath,
        download_url,
      })),
    );
    await cache.write("targets.json", text);
    return { text, source: "github" };
  } catch (error) {
    if (cached) return { text: cached.text, source: "stale", error };
    throw error;
  }
}

/**
 * The catalogue file a target id came from.
 *
 * Nearly every entry is `<id>.config`, but the catalogue is not
 * consistent: some entries carry a different extension or none at all.
 * So the listing decides, and the guess is only a fallback for a
 * listing that could not be fetched.
 */
async function fileForTarget(cache, targetId) {
  const cached = await cache.read("targets.json");
  if (cached) {
    try {
      const entry = JSON.parse(cached.text).find((row) => {
        const stem = row.name.replace(/\.(config|txt)$/, "");
        return stem.toUpperCase() === targetId.toUpperCase();
      });
      if (entry) return entry.name;
    } catch {
      /* a corrupt cache is no worse than no cache */
    }
  }
  return `${targetId}.config`;
}

/** One target's config text, cached by target id. */
async function fetchConfig(cache, targetId, { refresh }) {
  const cacheName = `${targetId}.config`;
  if (!refresh) {
    const cached = await cache.read(cacheName);
    if (cached) return cached.text;
  }

  const file = await fileForTarget(cache, targetId);
  const url = `https://raw.githubusercontent.com/${TARGETS_REPO}/${TARGETS_BRANCH}/${TARGETS_DIR}/${encodeURIComponent(file)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const cached = await cache.read(cacheName);
    if (cached) return cached.text;
    throw new Error(`Could not fetch ${file}: ${res.status}`);
  }
  const text = await res.text();
  await cache.write(cacheName, text);
  return text;
}

// --- the plugin -------------------------------------------------------

/**
 * @param {{repoRoot: string, cacheRoot: string}} options
 * @returns {import("vite").Plugin}
 */
export default function boardEditorApi({ repoRoot, cacheRoot }) {
  const profilePath = path.resolve(repoRoot, PROFILE_RELATIVE);
  const imagesRoot = path.resolve(repoRoot, IMAGES_RELATIVE);
  const boardsRoot = path.resolve(repoRoot, BOARDS_RELATIVE);
  const cache = makeCache(path.resolve(cacheRoot, "targets"));

  return {
    name: "board-editor-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const route = decodeURIComponent(url.pathname);
        const refresh = url.searchParams.get("refresh") === "1";

        try {
          // The app serves src/images at /images; the editor has to do
          // the same, because a profile's background path is stored the
          // way the configurator will ask for it.
          if (route.startsWith("/images/")) {
            const file = resolveWithin(
              imagesRoot,
              route.slice("/images/".length),
            );
            const body = await fs.readFile(file).catch(() => null);
            if (!body) return next();
            const type = file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".png")
                ? "image/png"
                : "application/octet-stream";
            return send(res, 200, body.toString("utf8"), type);
          }

          if (route === "/api/profiles" && req.method === "GET") {
            const text = await fs.readFile(profilePath, "utf8");
            return send(res, 200, text);
          }

          if (route === "/api/profiles" && req.method === "PUT") {
            const body = await readBody(req);
            const parsed = JSON.parse(body.toString("utf8"));
            if (!parsed || !Array.isArray(parsed.boards)) {
              return send(res, 400, { error: "Expected { boards: [...] }." });
            }
            await fs.writeFile(
              profilePath,
              `${JSON.stringify(parsed, null, 2)}\n`,
              "utf8",
            );
            return send(res, 200, { saved: PROFILE_RELATIVE });
          }

          if (route === "/api/backgrounds" && req.method === "GET") {
            const names = await fs
              .readdir(boardsRoot)
              .catch(() => [])
              .then((list) => list.filter((name) => name.endsWith(".svg")));
            return send(res, 200, { files: names });
          }

          if (route.startsWith("/api/backgrounds/") && req.method === "POST") {
            const name = route.slice("/api/backgrounds/".length);
            if (!/^[a-z0-9][a-z0-9._-]*\.svg$/i.test(name)) {
              return send(res, 400, {
                error: "Name must be a plain file name ending in .svg.",
              });
            }
            const body = (await readBody(req)).toString("utf8");
            if (!body.includes("<svg")) {
              return send(res, 400, { error: "That is not an SVG." });
            }
            await fs.mkdir(boardsRoot, { recursive: true });
            await fs.writeFile(resolveWithin(boardsRoot, name), body, "utf8");
            return send(res, 200, { href: `/images/boards/${name}` });
          }

          if (route === "/api/targets" && req.method === "GET") {
            const listing = await fetchListing(cache, { refresh });
            return send(
              res,
              200,
              JSON.stringify({
                source: listing.source,
                entries: JSON.parse(listing.text),
              }),
            );
          }

          if (route.startsWith("/api/targets/") && req.method === "GET") {
            const id = route.slice("/api/targets/".length);
            if (!/^[A-Za-z0-9_]{1,4}-[A-Za-z0-9_+-]+$/.test(id)) {
              return send(res, 400, { error: "Bad target id." });
            }
            const text = await fetchConfig(cache, id, { refresh });
            return send(res, 200, text, "text/plain; charset=utf-8");
          }
        } catch (error) {
          return send(res, 500, { error: String(error.message ?? error) });
        }

        return next();
      });
    },
  };
}
