import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import type { SidebarArchivedEvent } from '@/shared/types.js';

type SidebarArchivedInput = {
  projectIds?: Iterable<string>;
  sessionIds?: Iterable<string>;
};

/**
 * Productor único del delta `sidebar_archived`.
 *
 * Avisa a todas las pestañas conectadas que estos proyectos y sesiones se
 * archivaron, para que la barra los saque de su lista sin pedir de nuevo el
 * listado completo. Recorre `connectedClients` igual que el productor de
 * `session_upserted`.
 */
export function buildSidebarArchivedEvent(input: SidebarArchivedInput): SidebarArchivedEvent | null {
  const projectIds = [...new Set(input.projectIds ?? [])].filter(Boolean);
  const sessionIds = [...new Set(input.sessionIds ?? [])].filter(Boolean);

  // Sin nada que sacar no hay delta: no se manda un evento vacío.
  if (projectIds.length === 0 && sessionIds.length === 0) {
    return null;
  }

  return {
    kind: 'sidebar_archived',
    projectIds,
    sessionIds,
    timestamp: new Date().toISOString(),
  };
}

/** Devuelve a cuántos clientes se les mandó el delta (0 si no había nada que anunciar). */
export function broadcastSidebarArchived(input: SidebarArchivedInput): number {
  const event = buildSidebarArchivedEvent(input);
  if (!event) {
    return 0;
  }

  const payload = JSON.stringify(event);
  let sent = 0;
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(payload);
      sent += 1;
    }
  });

  return sent;
}
