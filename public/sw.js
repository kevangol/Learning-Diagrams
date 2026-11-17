// Learning Diagrams service worker — offline support.
// Bump VERSION to invalidate old caches after a deploy.
const VERSION = "v1";
const SHELL_CACHE = `ld-shell-${VERSION}`;
const RUNTIME_CACHE = `ld-runtime-${VERSION}`;
const DIAGRAM_CACHE = `ld-diagrams-${VERSION}`;

const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, RUNTIME_CACHE, DIAGRAM_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks us to pre-cache every diagram listed in diagrams.json.
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_DIAGRAMS" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(DIAGRAM_CACHE).then(async (cache) => {
        await Promise.all(
          event.data.urls.map(async (url) => {
            if (!(await cache.match(url))) {
              try {
                await cache.add(url);
              } catch {
                /* ignore individual failures */
              }
            }
          }),
        );
      }),
    );
  }
});

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch {
    const cached = (await cache.match(cacheKey)) || (await caches.match(cacheKey));
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: network first, fall back to cached app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL_CACHE, "/").catch(() => caches.match("/")),
    );
    return;
  }

  // Manifest JSON: always try fresh; ignore the ?t= cache-buster for the cache key.
  if (url.pathname === "/diagrams/diagrams.json") {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, "/diagrams/diagrams.json"));
    return;
  }

  // Diagram images: serve cached instantly, refresh in background.
  if (url.pathname.startsWith("/diagrams/")) {
    event.respondWith(staleWhileRevalidate(request, DIAGRAM_CACHE));
    return;
  }

  // Hashed build assets and icons never change.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
