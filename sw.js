/* sw.js — Service Worker
   Handles:
   1. Offline caching of the app shell (network-first, cache fallback)
   2. Bible chapter fetch caching (network-first, fallback to cache)
   3. Push notification display and click routing

   NOTE: every path here is RELATIVE. The app is served from a project
   subpath on GitHub Pages (/Daily-devotional-app/), so absolute paths
   like '/index.html' resolve to the user root and 404, which made
   cache.addAll() reject and the whole install fail.
*/

const CACHE_NAME = 'devotional-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './commentary.js',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ── INSTALL: pre-cache app shell ─────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      /* Cache entries individually: one bad URL must not fail the install. */
      .then(cache => Promise.all(
        PRECACHE_URLS.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('[sw] precache skipped', url, err))
        )
      ))
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

/* ── FETCH: serve from network or cache ───────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  /* Bible API: network-first, cache fallback */
  if (url.hostname === 'bible-api.com') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  /* Anything cross-origin (Firebase, Google, gstatic, fonts) — never
     intercept. Auth flows in particular must always hit the network. */
  if (url.origin !== self.location.origin) return;

  /* App shell: network-first so a redeploy (e.g. a changed
     firebase-config.js) is picked up immediately, with cache as the
     offline fallback. */
  event.respondWith(networkFirst(event.request));
});

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

    /* Navigations offline: fall back to the cached app shell. */
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }

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
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { url: data.url || './' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/* ── NOTIFICATION CLICK: open / focus app ─────────────────── */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  /* Resolve against the SW scope so this works on a project subpath. */
  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || './',
    self.registration.scope
  ).href;

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
