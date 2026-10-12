// NetSentinel Service Worker
const CACHE_NAME = 'netsentinel-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass-through network first for API requests
  if (event.request.url.includes('/api/')) {
    return;
  }
  // Let Vite / Browser handle assets dynamically
});
