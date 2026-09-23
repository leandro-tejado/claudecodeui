/**
 * Runs a list of async jobs one at a time, while the browser has nothing better
 * to do.
 *
 * Written for prefetching the chunks this app loads on demand: deferring the
 * terminal, the editor and the rest bought a fast first paint, and it would be a
 * poor trade if it bought it by making every later click wait. Pulling them in
 * during idle time gets both.
 *
 * One job per idle callback, never all at once, so a phone on a slow link spends
 * its bandwidth on whatever the user is actually doing. The caller decides *what*
 * to load; this file only decides *when*.
 */

/** Safari has no requestIdleCallback, so fall back to a timer. */
function whenIdle(callback: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === 'function') {
    idle(callback, { timeout: 2000 });
    return;
  }
  setTimeout(callback, 300);
}

/**
 * True when speculative downloading would take bandwidth the user needs, either
 * because they asked to save data or because the connection is barely there.
 */
function shouldHoldBack(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!connection) return false;
  return Boolean(connection.saveData) || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

export function runWhenIdle(jobs: ReadonlyArray<() => Promise<unknown>>): void {
  if (shouldHoldBack()) return;

  const queue = [...jobs];

  const next = () => {
    const job = queue.shift();
    if (!job) return;
    void job()
      .catch(() => {
        // A prefetch that fails costs nothing: the real import will try again.
      })
      .finally(() => whenIdle(next));
  };

  whenIdle(next);
}
