const CACHE_NAME = 'voltshare-v1.1.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/styles.css',
  '/landing.css',
  '/app.js',
  '/landing.js',
  '/data.js',
  '/db.js',
  '/config.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/logo.jpg'
];

// Install event - precache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use catch for individual items to avoid failing installation if one file is missing
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch((err) => console.warn('[SW] Cache fail:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate event - cleanup stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network-first for external APIs & dynamic requests; stale-while-revalidate for local assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for Supabase, Firebase, Google Auth, Google Maps, analytics, and non-GET requests
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache updated response for local same-origin assets
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
