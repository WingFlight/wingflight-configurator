// Web build only (registered from main.svelte.js). Scope is the directory it is
// served from, so each deployed build (/master/, /latest/, /v2.3/, a release)
// keeps its own cache. vite.config.mjs stamps the version and commit into
// CACHE_VERSION, so a new deploy drops the previous build's cache on
// activation.
//
// All of them share one origin, and so one CacheStorage. Several of them can
// be installed as apps side by side, so a build only ever drops the caches of
// its own scope -- never another installed version's offline copy -- and
// only ever reads from its own cache.

const CACHE_PREFIX = `wingflight-configurator@${self.registration.scope}@`;
const CACHE_VERSION = `${CACHE_PREFIX}0.0.0-9505e720`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./images/favicon/favicon-192.png",
  "./images/favicon/favicon-512.png",
];

// GitHub Pages lets the browser keep files for 10 minutes, and the asset
// names carry no hash. A plain fetch() right after a deploy can return the
// previous build's file from the HTTP cache, which would then be stored under
// this build's cache for good. Always ask the server instead.
function fetchFresh(request) {
  return fetch(request, { cache: "no-cache" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "no-cache" }))),
      ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(CACHE_PREFIX) &&
                cacheName !== CACHE_VERSION,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// caches.match() would search every build's cache on the origin.
function matchOwn(request) {
  return caches.open(CACHE_VERSION).then((cache) => cache.match(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetchFresh(request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseCopy));
          return response;
        })
        .catch(() => matchOwn(request).then((cached) => cached || matchOwn("./index.html"))),
    );
    return;
  }

  // Translations keep their file names from build to build. On the first
  // load after a deploy the previous build's worker is still in charge: it
  // fetches the page (and so the new code) fresh, but would answer these
  // from its own cache, leaving every new string showing as its key until
  // the next reload. So ask the server first, like for the page, and fall
  // back to the cache offline.
  if (requestUrl.pathname.includes("/locales/")) {
    event.respondWith(
      fetchFresh(request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseCopy));
          }
          return response;
        })
        .catch(() => matchOwn(request)),
    );
    return;
  }

  event.respondWith(
    matchOwn(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetchFresh(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseCopy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseCopy));
        return response;
      });
    }),
  );
});
