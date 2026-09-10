/**
 * The identity this browser registers with on /desktop-notifications.
 *
 * The server keys one endpoint row per deviceId and only delivers to endpoints
 * it has marked enabled, so a fresh id on every load would leave a trail of
 * dead rows and force the user to re-enable notifications each time. The id is
 * therefore generated once and kept in localStorage — it identifies a browser
 * profile, nothing about the user.
 */

const DEVICE_ID_STORAGE_KEY = 'browser-notifications-device-id';

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older WebViews have no randomUUID. Uniqueness across one user's browsers
  // is all this needs — it is not a secret and never leaves the tailnet.
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Returns this browser's stable device id, creating it on first use. */
export function readBrowserDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) return stored;

    const created = generateDeviceId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode or a full quota: a per-session id still delivers
    // notifications for as long as the tab lives, which beats none at all.
    return generateDeviceId();
  }
}

/** A human-readable name for the endpoint, shown nowhere yet but stored by the server. */
export function readBrowserDeviceLabel(): string {
  const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
  return platform ? `Navegador (${platform})` : 'Navegador';
}
