// Service Worker for CloudCLI PWA
// Cache only manifest (needed for PWA install). HTML and JS are never pre-cached
// so a rebuild + refresh always picks up the latest assets.
// Bumping this purges everything the previous version accumulated: the
// activate handler below deletes every cache whose name is not this one.
const CACHE_NAME = 'claude-ui-v5';
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

// Hashed assets, fetched so that a flaky link cannot leave the app unusable.
//
// Two things were breaking here on a phone connected over a relay, where the
// bundle arrives at tens of KB/s:
//
//   1. `response.clone()` tees a live network stream, and WebKit aborts the
//      whole thing when one branch drains slower than the other — surfacing as
//      "FetchEvent.respondWith received an error: TypeError: Load failed",
//      which is how vendor-codemirror died mid-download. Reading the body once
//      into a buffer and building both responses from it removes the tee.
//   2. A single dropped request killed the import for good. A download cut
//      halfway is worth retrying; a 404 is not, so only network failures do.
async function serveAsset(request) {
  const cached = await caches.match(request).catch(() => undefined);
  if (cached) return cached;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(request);
      // An honest HTTP error is an answer: hand it back instead of retrying.
      if (!response || !response.ok) return response;

      const buffer = await response.arrayBuffer();
      const init = {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
      };

      caches.open(CACHE_NAME)
        .then(cache => cache.put(request, new Response(buffer, init)))
        .catch(() => {}); /* a full cache is not a reason to fail the request */

      return new Response(buffer, init);
    } catch (error) {
      // Backs off a little before trying again; the last failure falls through.
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  // A chunk that neither cache nor network can supply must still resolve.
  // Rejecting here fails the import inside the app, which is how a whole view
  // ends up not rendering at all.
  return new Response('', { status: 503, statusText: 'Asset unavailable' });
}

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
    event.respondWith(serveAsset(event.request));
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
