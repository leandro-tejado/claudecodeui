// Service Worker for CloudCLI PWA
// Cache only manifest (needed for PWA install). HTML and JS are never pre-cached
// so a rebuild + refresh always picks up the latest assets.
// Bumping this purges everything the previous version accumulated: the
// activate handler below deletes every cache whose name is not this one.
const CACHE_NAME = 'claude-ui-v3';
const urlsToCache = [
  '/manifest.json'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Fetch event — network-first for everything except hashed assets
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never intercept API requests or WebSocket upgrades
  if (url.includes('/api/') || url.includes('/ws')) {
    return;
  }

  // Navigation requests (HTML) — always go to network, no caching.
  //
  // The offline page must not depend on the cache being readable: when that
  // lookup rejected, `respondWith` got a rejected promise and the browser
  // turned a recoverable blip into a hard network error on the page itself.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        '<h1>Offline</h1><p>Please check your connection.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html' } }
      ))
    );
    return;
  }

  // Hashed assets (JS/CSS in /assets/) — cache-first since filenames change per build
  if (url.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request)
        .catch(() => undefined)
        .then(cached => cached || fetch(event.request).then(response => {
          // Only a usable response is worth keeping: caching an error would
          // pin a broken chunk for the life of the cache.
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', {
          // A lazily-loaded chunk that neither cache nor network can supply
          // must still resolve. Rejecting here fails the import inside the
          // app, which is how a whole view ends up not rendering.
          status: 503,
          statusText: 'Asset unavailable',
        })))
    );
    return;
  }

  // Everything else — network-first.
  //
  // `caches.match` resolves to undefined for anything never cached, and
  // `respondWith(undefined)` throws "Failed to convert value to 'Response'" —
  // which the browser reports to the page as a failed request. A miss has to
  // end in a real Response, so the app sees an honest error it can retry.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)
      .catch(() => undefined)
      .then(cached => cached || new Response('', {
        status: 503,
        statusText: 'Offline and not cached',
      })))
  );
});

// Activate event — purge old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Push notification event
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'CloudCLI', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/logo-256.png',
    badge: '/logo-128.png',
    data: payload.data || {},
    tag: payload.data?.tag || `${payload.data?.sessionId || 'global'}:${payload.data?.code || 'default'}`,
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'CloudCLI', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const sessionId = event.notification.data?.sessionId;
  const provider = event.notification.data?.provider || null;
  const urlPath = sessionId ? `/session/${sessionId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          client.postMessage({
            type: 'notification:navigate',
            sessionId: sessionId || null,
            provider,
            urlPath
          });
          return;
        }
      }
      return self.clients.openWindow(urlPath);
    })
  );
});
