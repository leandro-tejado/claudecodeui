import { getUsageWindow } from './usage-window.service.js';

/**
 * Pushes the five-hour window to every open client.
 *
 * Mirrors `session-upsert-broadcast.service.ts`: one producer, the whole payload
 * on the wire. Clients must not have to fetch after being told something moved —
 * the point of the indicator is that it costs nothing to watch.
 */
export async function broadcastUsageWindow(): Promise<void> {
  // Dynamic, not a static top-level import: `claude-runtime.provider.js` now
  // reaches this module while `provider.registry.ts` is still mid-evaluation
  // (it is one of the modules that module's own import chain constructs), and
  // `@/modules/websocket/index.js` re-exports `chat-websocket.service.ts`,
  // which imports back into `@/modules/providers/index.js`. A static import
  // here closed that into a cycle and threw `Cannot access 'providerRegistry'
  // before initialization` from `provider-models.service.ts`. By the time this
  // function actually runs — a live broadcast, never at module load — the
  // whole graph is long done evaluating, so the dynamic import just hits the
  // module cache. Still the barrel, per this repo's import-boundaries rule.
  const { connectedClients, WS_OPEN_STATE } = await import('@/modules/websocket/index.js');
  const snapshot = await getUsageWindow();
  const frame = JSON.stringify(snapshot);

  for (const client of connectedClients) {
    if (client.readyState !== WS_OPEN_STATE) continue;
    try {
      client.send(frame);
    } catch (error) {
      console.error('usage-window: failed to send frame to a client', { error });
    }
  }
}

/**
 * Debounce around the broadcast.
 *
 * A live session appends to its transcript dozens of times per turn. Recomputing
 * on each of those would make the indicator cost more CPU than the chat it sits
 * beside, so writes coalesce into at most one broadcast per second, and a burst
 * that arrives mid-run queues exactly one follow-up instead of piling up.
 */
const DEBOUNCE_MS = 1000;
let timer: NodeJS.Timeout | null = null;
let inFlight = false;
let rerunRequested = false;

async function run(): Promise<void> {
  if (inFlight) {
    rerunRequested = true;
    return;
  }
  inFlight = true;
  try {
    await broadcastUsageWindow();
  } catch (error) {
    // Never let this take the session watcher down with it: `session_upserted`
    // is load-bearing for the sidebar and this indicator is not.
    console.error('usage-window: broadcast failed', { error });
  } finally {
    inFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      scheduleUsageWindowBroadcast();
    }
  }
}

export function scheduleUsageWindowBroadcast(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, DEBOUNCE_MS);
}
