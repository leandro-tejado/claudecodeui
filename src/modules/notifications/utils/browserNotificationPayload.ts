/**
 * Turning a server notification frame into arguments for `new Notification()`.
 *
 * Kept apart from the socket so the mapping can be tested without a WebSocket:
 * the payload comes from `buildNotificationPayload` in the server's
 * notification orchestrator, which is already formatted for display — this
 * layer only reshapes it and refuses the frames that would render an empty
 * notification.
 */

/** One `{ type: 'notification' }` frame off the /desktop-notifications socket. */
export type DesktopNotificationFrame = {
  type?: unknown;
  id?: unknown;
  payload?: {
    title?: unknown;
    body?: unknown;
    data?: {
      tag?: unknown;
      sessionId?: unknown;
      provider?: unknown;
      urlPath?: unknown;
    } | null;
  } | null;
};

/** Everything needed to show one notification and to act on its click. */
export type BrowserNotification = {
  title: string;
  body: string;
  /** Collapses repeats of the same session+event instead of stacking them. */
  tag: string | undefined;
  sessionId: string | null;
  provider: string | null;
  urlPath: string | null;
};

/**
 * The same icon the service worker uses for push notifications, so a run that
 * notifies through either path looks identical in the Windows action centre.
 */
export const NOTIFICATION_ICON_PATH = '/logo-256.png';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Returns null for anything that is not a renderable notification.
 *
 * A frame with no title is dropped rather than shown under a placeholder: an
 * untitled toast tells the user nothing and trains them to ignore the next one.
 */
export function readBrowserNotification(frame: unknown): BrowserNotification | null {
  if (!frame || typeof frame !== 'object') return null;

  const { type, payload } = frame as DesktopNotificationFrame;
  if (type !== 'notification' || !payload || typeof payload !== 'object') return null;

  const title = readString(payload.title);
  if (!title) return null;

  const data = payload.data && typeof payload.data === 'object' ? payload.data : null;

  return {
    title,
    body: readString(payload.body) ?? '',
    tag: readString(data?.tag) ?? undefined,
    sessionId: readString(data?.sessionId),
    provider: readString(data?.provider),
    urlPath: readString(data?.urlPath),
  };
}
