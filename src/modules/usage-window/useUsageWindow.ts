import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { UsageWindowSnapshot } from '@/modules/usage-window/types';

/**
 * The five-hour window, seeded by one fetch and kept current by the socket.
 *
 * The server pushes a whole snapshot on every `usage_window` frame, so there is
 * nothing to fetch after the first render. A reconnect is the exception: frames
 * sent while the socket was down are gone, and the transport injects the
 * synthetic `websocket_reconnected` kind precisely so features can catch up
 * instead of sitting on a stale number.
 */
export function useUsageWindow(): UsageWindowSnapshot | null {
  const [snapshot, setSnapshot] = useState<UsageWindowSnapshot | null>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await authenticatedFetch('/api/usage-window');
        if (!response.ok) return;
        const data = (await response.json()) as UsageWindowSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        // A failed poll must never take the header down with it. Staying on the
        // last known value (or on the empty state) is the correct outcome.
      }
    };

    void load();

    const unsubscribe = subscribe((event) => {
      if (event?.kind === 'usage_window') {
        setSnapshot(event as unknown as UsageWindowSnapshot);
        return;
      }
      if (event?.kind === 'websocket_reconnected') {
        void load();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [subscribe]);

  return snapshot;
}
