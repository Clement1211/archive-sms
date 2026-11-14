/**
 * Service Worker for Archives SMS PWA
 * Simple caching for offline use
 */

const CACHE = "archives-sms-v1";
const FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./favicon.svg"
];

// Install service worker
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .catch(err => console.warn("Cache install failed:", err))
  );
});

// Activate service worker
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      );
    })
  );
});

// Fetch from cache
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  
  e.respondWith(
    caches.match(e.request)
      .then(r => r || fetch(e.request).catch(() => caches.match("./index.html")))
  );
});
