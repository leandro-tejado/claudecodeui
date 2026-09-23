/**
 * Turns whatever an API sent as an error into text that React can render.
 *
 * The server answers every failure with `{ success: false, error: { code,
 * message } }`, but the client types that field as a string and hands it
 * straight to the UI. TypeScript does not check what comes off the wire, so the
 * lie survives compilation and dies at render time: React refuses to render an
 * object as a child and throws error #31, which unmounts the tree above it. A
 * failed login — the wrong password, an expired token — turned into a white
 * screen with nothing on it.
 *
 * So every error that reaches a component goes through here first, and the
 * shape it arrived in stops mattering.
 */
export function apiErrorText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (value instanceof Error) return value.message || null;

  if (typeof value === 'object') {
    const candidate = value as { message?: unknown; error?: unknown; code?: unknown };
    // `message` first: it is the human half of the server envelope.
    const message = apiErrorText(candidate.message) ?? apiErrorText(candidate.error);
    if (message) {
      const code = typeof candidate.code === 'string' ? candidate.code : null;
      return code && code !== message ? `${message} (${code})` : message;
    }
    if (typeof candidate.code === 'string' && candidate.code) return candidate.code;
  }

  return null;
}
