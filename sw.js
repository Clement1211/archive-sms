/**
 * Service Worker for Archives SMS PWA
 * Robust caching for offline use
 */

const CACHE = "archives-sms-v2";
const FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-192.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png"
];

// Install service worker
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        // Add all files, but don't fail if one is missing
        const promises = FILES.map(file => {
          return cache.add(file).catch(err => {
            console.warn(`Failed to cache ${file}:`, err);
            return Promise.resolve(); // Continue even if one file fails
          });
        });
        return Promise.all(promises);
      })
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
