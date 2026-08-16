/* sw.js — Service Worker
   Handles:
   1. Offline caching of the app shell (cache-first for static assets)
   2. Bible chapter fetch caching (network-first, fallback to cache)
   3. Push notification display and click routing
*/

const CACHE_NAME = 'devotional-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/commentary.js',
  '/app.js',
  '/firebase-config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* ── INSTALL: pre-cache app shell ─────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: remove old caches ──────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH: serve from cache or network ───────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Bible API: network-first, cache fallback */
  if (url.hostname === 'bible-api.com') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  /* Firebase and Google: always network */
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('google.com') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }

  /* App shell: cache-first */
  if (event.request.method === 'GET') {
    event.respondWith(cacheFirst(event.request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* ── PUSH: show notification ──────────────────────────────── */
self.addEventListener('push', event => {
  let data = { title: 'Daily Devotional', body: "Today's reading is ready.", tag: 'devotional-daily' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch { /* use defaults */ }
  }

  const options = {
    body: data.body,
    tag: data.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/* ── NOTIFICATION CLICK: open / focus app ─────────────────── */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
