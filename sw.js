/**
 * Service Worker for Archives SMS PWA
 * Reliable updates with network-first strategy for critical files
 */

const CACHE_VERSION = 'v8';
const CRITICAL_FILES = [
  './',
  './index.html',
  './app/',
  './app/index.html',
  './src/app.js',
  './src/parser.js',
  './src/i18n.js',
  './src/locales/fr.js',
  './src/locales/en.js',
  './styles/styles.css',
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

// Pure function to determine if a URL is critical
function isCriticalFile(url, scope) {
  try {
    const resolvedUrl = new URL(url, scope);
    const urlPath = resolvedUrl.origin + resolvedUrl.pathname;
    const scopeUrl = new URL(scope);
    const scopePath = scopeUrl.origin + scopeUrl.pathname;
    
    // Normalize scope path (remove trailing slash)
    const normalizedScope = scopePath.endsWith('/') ? scopePath.slice(0, -1) : scopePath;
    
    // Normalize url path (remove trailing slash)
    const normalizedUrlPath = urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;
    
    // Check if the URL matches any critical file
    for (const file of CRITICAL_FILES) {
      const resolvedFile = new URL(file, scope);
      const filePath = resolvedFile.origin + resolvedFile.pathname;
      const normalizedFilePath = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;
      
      if (normalizedUrlPath === normalizedFilePath) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    console.warn('Error checking critical file:', e);
    return false;
  }
}

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
  
  if (isCriticalFile(event.request.url, self.registration.scope)) {
    // Network-first with cache fallback for critical files
    event.respondWith(
      fetch(event.request).then((res) => {
        // Update cache with fresh response
        if (res.ok) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, res.clone());
          });
        }
        return res;
      }).catch(() => {
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

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isCriticalFile };
}
