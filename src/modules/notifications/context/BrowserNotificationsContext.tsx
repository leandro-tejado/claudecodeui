import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/modules/auth';
import {
  readBrowserDeviceId,
  readBrowserDeviceLabel,
} from '@/modules/notifications/utils/browserNotificationDevice';
import {
  NOTIFICATION_ICON_PATH,
  readBrowserNotification,
} from '@/modules/notifications/utils/browserNotificationPayload';
import type { BrowserNotification } from '@/modules/notifications/utils/browserNotificationPayload';
import { expireAuthSession, isAuthTokenExpired } from '@/shared/authToken';
import { IS_PLATFORM } from '@/shared/utils';

type BrowserNotificationsContextValue = {
  /** False in browsers without the Notification API, and inside the Electron shell. */
  isSupported: boolean;
  /** The browser-level permission. Nothing is delivered unless this is `'granted'`. */
  permission: NotificationPermission;
  /** Whether this browser is currently registered on the notification socket. */
  isConnected: boolean;
  /** Prompts for permission; resolves to the resulting state. */
  requestPermission: () => Promise<NotificationPermission>;
  /** Shows a local notification so the user can confirm the permission works. */
  showTestNotification: () => void;
};

const BrowserNotificationsContext = createContext<BrowserNotificationsContextValue | null>(null);

export const useBrowserNotifications = () => {
  const context = useContext(BrowserNotificationsContext);
  if (!context) {
    throw new Error('useBrowserNotifications must be used within a BrowserNotificationsProvider');
  }
  return context;
};

/** Time between reconnect attempts, matching the chat socket so both recover together. */
const RECONNECT_DELAY_MS = 3000;

function isNotificationSupported(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  // The Electron shell has its own notification bridge on the same socket;
  // running both would show every notification twice.
  return !(window as unknown as { cloudcliDesktopNotifications?: unknown }).cloudcliDesktopNotifications;
}

function buildNotificationSocketUrl(token: string | null): string | null {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = '/desktop-notifications';
  if (IS_PLATFORM) return `${protocol}//${window.location.host}${path}`;
  if (!token) return null;
  if (isAuthTokenExpired(token)) {
    expireAuthSession();
    return null;
  }
  return `${protocol}//${window.location.host}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Shows one notification and wires its click to the existing in-app navigation.
 *
 * The click posts the very same `notification:navigate` message the service
 * worker posts for push notifications, so both paths land in one handler in
 * ProjectEffects instead of growing a second copy of the routing rules.
 */
function showBrowserNotification(notification: BrowserNotification): void {
  const shown = new Notification(notification.title, {
    body: notification.body,
    icon: NOTIFICATION_ICON_PATH,
    tag: notification.tag,
  });

  shown.onclick = () => {
    window.focus();
    shown.close();
    window.postMessage(
      {
        type: 'notification:navigate',
        sessionId: notification.sessionId,
        provider: notification.provider,
        urlPath: notification.urlPath,
      },
      window.location.origin,
    );
  };
}

/**
 * Mounted once by App so the browser receives the desktop notifications the
 * server already emits for every finished run.
 *
 * This is the web half of a channel that previously only the Electron app
 * consumed: the server side (fan-out, de-duplication, per-event preferences)
 * is unchanged, and this provider only registers as one more endpoint.
 */
export const BrowserNotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { isLoading: isAuthLoading, token, user } = useAuth();

  const isSupported = useMemo(() => isNotificationSupported(), []);

  // Mirrors the browser's permission, which is not observable through React —
  // it changes from a native prompt, so it has to be captured when we ask.
  const [permission, setPermission] = useState<NotificationPermission>(() => (
    isSupported ? Notification.permission : 'denied'
  ));

  // Drives the status line in Settings. Without it the user cannot tell
  // "permission granted but the socket never connected" from a working setup.
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  const showTestNotification = useCallback(() => {
    if (!isSupported || Notification.permission !== 'granted') return;
    showBrowserNotification({
      title: 'LT Space',
      body: 'Las notificaciones están activas.',
      tag: 'lt-space:test',
      sessionId: null,
      provider: null,
      urlPath: null,
    });
  }, [isSupported]);

  // The socket is only worth opening once notifications can actually be shown,
  // so permission is a dependency rather than a check inside the handler.
  useEffect(() => {
    if (!isSupported || permission !== 'granted') return undefined;
    if (!IS_PLATFORM && (isAuthLoading || !user)) return undefined;

    unmountedRef.current = false;

    const connect = function connect() {
      if (unmountedRef.current) return;

      const url = buildNotificationSocketUrl(token);
      if (!url) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        console.error('Notification socket failed to open:', error);
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'register',
          deviceId: readBrowserDeviceId(),
          label: readBrowserDeviceLabel(),
          platform: 'web',
          appVersion: null,
        }));
      };

      socket.onmessage = (event) => {
        let frame: unknown;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }

        // `registered` is the server's acknowledgement; until it arrives this
        // socket is open but not yet a delivery target.
        if ((frame as { type?: unknown })?.type === 'registered') {
          setIsConnected(true);
          return;
        }

        const notification = readBrowserNotification(frame);
        if (!notification) return;

        try {
          showBrowserNotification(notification);
        } catch (error) {
          // A revoked permission throws here rather than resolving to 'denied'.
          console.error('Could not show notification:', error);
          setPermission(Notification.permission);
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        // onclose always follows, and it owns the reconnect.
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const socket = socketRef.current;
      if (socket) {
        // Detach before closing so the intentional close cannot schedule a
        // reconnect against a token that is already being replaced.
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        socketRef.current = null;
      }
      setIsConnected(false);
    };
  }, [isAuthLoading, isSupported, permission, token, user]);

  const value = useMemo<BrowserNotificationsContextValue>(
    () => ({ isSupported, permission, isConnected, requestPermission, showTestNotification }),
    [isSupported, permission, isConnected, requestPermission, showTestNotification],
  );

  return (
    <BrowserNotificationsContext.Provider value={value}>
      {children}
    </BrowserNotificationsContext.Provider>
  );
};
