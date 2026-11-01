// CivicSense PWA Service Worker - Offline resilience for Dibrugarh University
const CACHE_NAME = "civicsense-cache-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/campus/team-characters.webp",
  "/campus/map-data.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Do not intercept non-GET or cross-origin API calls
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Never intercept Turbopack or HMR development streams
  if (
    url.pathname.includes("webpack-hmr") ||
    url.pathname.includes("__turbopack") ||
    url.pathname.includes(".hot-update.") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Network-first for HTML pages
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/")) || Response.error();
      })
    );
    return;
  }

  // Network-first for dynamic Next.js chunks, with cache fallback
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/campus/")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
