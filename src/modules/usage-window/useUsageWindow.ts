import { useCallback, useEffect, useState } from 'react';

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
 * instead of sitting on a stale number. A tab coming back to the foreground is
 * the other exception: a laptop closed for hours reconnects the socket fine,
 * but the snapshot it kept from before holding no longer matches what
 * `getUsageWindow()` would say right now (Fase 3, 05-oct) — so `visibilitychange`
 * refetches too, same as the reconnect does.
 */
/** La cuenta que ya cubría este módulo antes de que hubiera más de una. */
const CUENTA_POR_DEFECTO = 'optimum';

/**
 * Una ventana por cuenta (plans/06-octubre-vps-multi-cuenta.md, Fase 3): la
 * cuota es de la cuenta de IA, no de la máquina. `cuenta` elige cuál; sin ella
 * es optimum, como siempre. El servidor manda un frame por cuenta con su `cuenta`
 * adentro (uno sin `cuenta` es de un servidor viejo y vale optimum), y acá solo
 * se escucha el de la cuenta pedida.
 */
export function useUsageWindow(cuenta: string = CUENTA_POR_DEFECTO): UsageWindowSnapshot | null {
  // La lectura guarda a qué cuenta pertenece: al cambiar `cuenta` se devuelve
  // null hasta que llegue la nueva, así una cuenta no hereda la lectura de la
  // anterior ni por un instante (y sin un setState síncrono dentro del efecto).
  const [lectura, setLectura] = useState<{ cuenta: string; snapshot: UsageWindowSnapshot } | null>(null);
  const setSnapshot = useCallback(
    (snapshot: UsageWindowSnapshot) => setLectura({ cuenta, snapshot }),
    [cuenta],
  );
  const { subscribe } = useWebSocket();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const url = cuenta === CUENTA_POR_DEFECTO
          ? '/api/usage-window'
          : `/api/usage-window?cuenta=${encodeURIComponent(cuenta)}`;
        const response = await authenticatedFetch(url);
        if (!response.ok) return;
        const data = (await response.json()) as UsageWindowSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        // A failed poll must never take the header down with it. Staying on the
        // last known value (or on the empty state) is the correct outcome.
      }
    };

    void load();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const unsubscribe = subscribe((event) => {
      if (event?.kind === 'usage_window') {
        const frame = event as unknown as UsageWindowSnapshot;
        if ((frame.cuenta ?? CUENTA_POR_DEFECTO) === cuenta) setSnapshot(frame);
        return;
      }
      if (event?.kind === 'websocket_reconnected') {
        void load();
      }
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
  }, [subscribe, cuenta, setSnapshot]);

  return lectura?.cuenta === cuenta ? lectura.snapshot : null;
}
