import { recursosService } from './recursos.service.js';

/**
 * Empuja RAM/disco/sesiones a cada cliente conectado, cada 30 s.
 *
 * A diferencia de `usage-window-broadcast.service.ts` esto no reacciona a un
 * evento (no hay un "se escribió una línea" para RAM libre) — es la métrica
 * la que cambia sola con el tiempo, así que el propio intervalo es el
 * disparador. Mismo patrón de frame por canal websocket: un `kind` en el
 * JSON, el cliente filtra por eso.
 */
export async function broadcastRecursos(): Promise<void> {
  const { connectedClients, WS_OPEN_STATE } = await import('@/modules/websocket/index.js');
  const snapshot = recursosService.medir();
  const frame = JSON.stringify(snapshot);

  for (const client of connectedClients) {
    if (client.readyState !== WS_OPEN_STATE) continue;
    try {
      client.send(frame);
    } catch (error) {
      console.error('recursos: failed to send frame to a client', { error });
    }
  }
}

const BROADCAST_INTERVAL_MS = 30_000;
let timer: NodeJS.Timeout | null = null;

export function startRecursosBroadcast(): void {
  if (timer) return;
  timer = setInterval(() => {
    void broadcastRecursos().catch((error) => {
      console.error('recursos: broadcast failed', { error });
    });
  }, BROADCAST_INTERVAL_MS);
}

export function stopRecursosBroadcast(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
