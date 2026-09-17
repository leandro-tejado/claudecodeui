import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';

/** Mirror of `MedicionRam` en `server/modules/system/services/ram-ceiling.service.ts`. */
export type MedicionRam = {
  porcentajePct: number | null;
  usadaGb: number | null;
  totalGb: number | null;
};

/** Mirror of `MedicionDisco` en `server/modules/system/services/recursos.service.ts`. */
export type MedicionDisco = {
  usadoPct: number | null;
  usadoGb: number | null;
  totalGb: number | null;
};

/** Mirror of `RecursosSnapshot` en el mismo servicio. */
export type RecursosSnapshot = {
  kind: 'recursos';
  ram: MedicionRam;
  disco: MedicionDisco;
  sesionesTmux: number;
  techoRam: number;
};

/**
 * RAM, disco, sesiones de tmux vivas y el techo del gobernador (Fase 3 del
 * plan `16-septiembre-os-orquestador-y-recursos.md`).
 *
 * Mismo patrón que `useUsageWindow`: un fetch inicial para no esperar el
 * primer broadcast, y después el socket — acá empujado cada 30 s por el
 * servidor porque la métrica cambia sola con el tiempo, no por un evento.
 */
export function useRecursos(): RecursosSnapshot | null {
  const [snapshot, setSnapshot] = useState<RecursosSnapshot | null>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await authenticatedFetch('/api/system/recursos');
        if (!response.ok) return;
        const data = (await response.json()) as RecursosSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        // Un fetch fallido nunca tira abajo el header: se queda con el
        // último valor conocido, o vacío si todavía no hubo ninguno.
      }
    };

    void load();

    const unsubscribe = subscribe((event) => {
      if (event?.kind === 'recursos') {
        setSnapshot(event as unknown as RecursosSnapshot);
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
