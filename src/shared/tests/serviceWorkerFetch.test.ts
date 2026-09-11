import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

import { test } from 'vitest';

/**
 * `event.respondWith()` must be handed a Response. Give it a promise that
 * resolves to `undefined` and the browser throws "Failed to convert value to
 * 'Response'"; give it a rejected promise and the request fails outright. Both
 * turned a recoverable network blip into a hard failure of the page — chunks
 * that never loaded, a chat that rendered without its newest messages, and a
 * reload as the only way out.
 *
 * These tests load the real `public/sw.js` and pin the property that matters:
 * whatever goes wrong, every intercepted request ends in a Response.
 */

type FetchHandler = (event: {
  request: { url: string; mode: string };
  respondWith: (value: unknown) => void;
}) => void;

/** Loads sw.js in a sandbox where the network is down and the cache is empty. */
function loadServiceWorker({ cacheHit = null as unknown, cacheThrows = false } = {}) {
  const listeners = new Map<string, FetchHandler>();
  const sandbox: Record<string, unknown> = {
    self: {
      addEventListener: (type: string, handler: FetchHandler) => listeners.set(type, handler),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve() }),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
      match: () => (cacheThrows ? Promise.reject(new Error('cache unavailable')) : Promise.resolve(cacheHit)),
    },
    fetch: () => Promise.reject(new Error('network down')),
    Response,
  };

  runInContext(readFileSync('public/sw.js', 'utf8'), createContext(sandbox));
  return listeners.get('fetch')!;
}

/** Runs one request through the handler and returns what respondWith received. */
async function respondTo(handler: FetchHandler, url: string, mode: string) {
  let answered: unknown;
  handler({ request: { url, mode }, respondWith: (value) => { answered = value; } });
  assert.ok(answered !== undefined, 'the handler must intercept this request');
  return await (answered as Promise<unknown>);
}

test('a failed navigation still answers with a Response when the cache is unreadable', async () => {
  const handler = loadServiceWorker({ cacheThrows: true });
  const response = await respondTo(handler, 'https://host/session/abc', 'navigate');

  assert.ok(response instanceof Response, 'navigation must not reject');
  assert.equal(response.status, 503);
});

test('an uncached asset that fails to load answers with a Response, not undefined', async () => {
  const handler = loadServiceWorker({ cacheHit: undefined });
  const response = await respondTo(handler, 'https://host/assets/index-abc.js', 'no-cors');

  assert.ok(response instanceof Response, 'a cache miss must not resolve to undefined');
});

test('any other uncached request answers with a Response, not undefined', async () => {
  const handler = loadServiceWorker({ cacheHit: undefined });
  const response = await respondTo(handler, 'https://host/manifest.json', 'no-cors');

  assert.ok(response instanceof Response, 'a cache miss must not resolve to undefined');
  assert.equal(response.status, 503);
});

test('api and websocket traffic is never intercepted', async () => {
  const handler = loadServiceWorker();
  for (const url of ['https://host/api/providers/sessions/x/messages', 'https://host/ws?token=x']) {
    let answered: unknown = 'untouched';
    handler({ request: { url, mode: 'cors' }, respondWith: (value) => { answered = value; } });
    assert.equal(answered, 'untouched', `${url} must pass straight through`);
  }
});
