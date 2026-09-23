/**
 * Retries a dynamic import before letting it fail.
 *
 * An `import()` is a network request, and on a phone over a relay it is a
 * network request that sometimes does not finish. `React.lazy` has no notion of
 * retrying: the first rejection is final, and it propagates past every Suspense
 * boundary, because those catch pending, not failed. Without an error boundary
 * above it the whole tree unmounts — a blank screen caused by one slow download.
 *
 * Three attempts with a growing pause. The service worker in front of these
 * requests already retries the network itself and caches what it gets, so the
 * second attempt usually lands; when it does not, the rejection is real and
 * belongs to the error boundary.
 */
export async function retryImport<T>(load: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError;
}
