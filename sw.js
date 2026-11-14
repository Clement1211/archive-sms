/**
 * Service Worker for Archives SMS PWA
 * Reliable updates with network-first strategy for critical files
 */

const CACHE_VERSION = 'v1';
const CRITICAL_FILES = [
  './',
  './index.html',
  './app.js',
  './parser.js',
  './styles.css',
  './manifest.webmanifest'
];
const STATIC_FILES = [
  './favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-192.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

const CACHE_NAME = `archives-sms-${CACHE_VERSION}`;

// Install: cache all files, skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const allFiles = [...CRITICAL_FILES, ...STATIC_FILES];
      return cache.addAll(allFiles).catch((err) => {
        console.warn('Cache install failed:', err);
        return Promise.resolve(); // Don't fail on cache errors
      });
    }).then(() => {
      // Skip waiting so the new SW activates immediately
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Claim all clients immediately
      self.clients.claim(),
      // Delete old caches
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

// Fetch: network-first for critical files, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isCritical = CRITICAL_FILES.some(file => 
    url.pathname.endsWith(file) || url.pathname === file
  );
  
  if (isCritical) {
    // Network-first with cache fallback for critical files
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((response) => {
          return response || caches.match('./index.html');
        });
      })
    );
  } else {
    // Cache-first for static files (icons, etc.)
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).catch(() => {
          return caches.match('./index.html');
        });
      })
    );
  }
});
