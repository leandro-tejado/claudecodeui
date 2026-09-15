import { useSyncExternalStore } from 'react';

/*
 * Filas de subagentes vivos, para el sidebar.
 *
 * Mismo store externo minimo que `contextMeterStore`: el dato nace en el chat
 * (cada `Task` es una fila mas en el mensaje de la sesion) y se dibuja en el
 * sidebar, otra rama del arbol. El bridge (`SkinSubagentBridge`) es el unico
 * escritor; este archivo solo guarda el mapa y notifica.
 *
 * **Clave: el `toolUseId` del `Task`.** Es el mismo id que ya usan
 * `toolId`/`toolCallId` en el resto del chat para correlacionar la llamada con
 * su resultado, asi que un `tool_result` o un `task_notification` con ese id
 * cierran la fila que abrio el `Task`.
 *
 * **Por que no hay debounce de re-render por igualdad profunda como en
 * `contextMeterStore`:** ahi hacia falta porque el composer republica el mismo
 * numero en cada tecla. Aca cada publicacion ya es la proyeccion de un `Set`
 * de filas que cambio de verdad (alta, cierre, stale o barrido); publicar solo
 * cuando el mapa cambia de referencia alcanza.
 */

export type SubagentStatus = 'running' | 'completed' | 'failed' | 'stale';

export type SubagentRow = {
  toolUseId: string;
  sessionId: string;
  type: string;
  description: string;
  model?: string;
  status: SubagentStatus;
  startedAt: number;
};

const STALE_AFTER_MS = 15 * 60 * 1000;
const SWEEP_AFTER_MS = 10 * 1000;

let rows = new Map<string, SubagentRow>();
const listeners = new Set<() => void>();
const sweepTimers = new Map<string, ReturnType<typeof setTimeout>>();
const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => rows;

const clearStaleTimer = (toolUseId: string) => {
  const timer = staleTimers.get(toolUseId);
  if (timer) {
    clearTimeout(timer);
    staleTimers.delete(toolUseId);
  }
};

const clearSweepTimer = (toolUseId: string) => {
  const timer = sweepTimers.get(toolUseId);
  if (timer) {
    clearTimeout(timer);
    sweepTimers.delete(toolUseId);
  }
};

const armStaleTimer = (toolUseId: string) => {
  clearStaleTimer(toolUseId);
  const timer = setTimeout(() => {
    staleTimers.delete(toolUseId);
    const row = rows.get(toolUseId);
    // Sin un solo evento en 15 minutos: no desaparece, pasa a gris. Una fila
    // que se borra sola esconde justo el caso que interesa.
    if (row && row.status === 'running') {
      const next = new Map(rows);
      next.set(toolUseId, { ...row, status: 'stale' });
      rows = next;
      emit();
    }
  }, STALE_AFTER_MS);
  staleTimers.set(toolUseId, timer);
};

const armSweepTimer = (toolUseId: string) => {
  clearSweepTimer(toolUseId);
  const timer = setTimeout(() => {
    sweepTimers.delete(toolUseId);
    if (!rows.has(toolUseId)) return;
    const next = new Map(rows);
    next.delete(toolUseId);
    rows = next;
    emit();
  }, SWEEP_AFTER_MS);
  sweepTimers.set(toolUseId, timer);
};

/** Abre o actualiza la fila de un `Task` en vuelo. Republica solo si algo cambio. */
export const upsertSubagent = (input: {
  toolUseId: string;
  sessionId: string;
  type: string;
  description: string;
  model?: string;
  status?: SubagentStatus;
  startedAt?: number;
}): void => {
  const existing = rows.get(input.toolUseId);
  const status = input.status ?? existing?.status ?? 'running';
  const next: SubagentRow = {
    toolUseId: input.toolUseId,
    sessionId: input.sessionId,
    type: input.type,
    description: input.description,
    model: input.model ?? existing?.model,
    status,
    startedAt: existing?.startedAt ?? input.startedAt ?? Date.now(),
  };

  if (
    existing
    && existing.sessionId === next.sessionId
    && existing.type === next.type
    && existing.description === next.description
    && existing.model === next.model
    && existing.status === next.status
    && existing.startedAt === next.startedAt
  ) {
    return;
  }

  const map = new Map(rows);
  map.set(input.toolUseId, next);
  rows = map;

  if (status === 'running') {
    // Cualquier evento (alta o actualizacion) reinicia el reloj del cinturon.
    armStaleTimer(input.toolUseId);
    clearSweepTimer(input.toolUseId);
  } else if (status === 'completed' || status === 'failed') {
    clearStaleTimer(input.toolUseId);
    armSweepTimer(input.toolUseId);
  } else {
    // stale: no barre sola.
    clearStaleTimer(input.toolUseId);
    clearSweepTimer(input.toolUseId);
  }

  emit();
};

/** Cierra la fila de un `Task`, via `tool_result` o `task_notification`. */
export const closeSubagent = (toolUseId: string, status: 'completed' | 'failed'): void => {
  const existing = rows.get(toolUseId);
  if (!existing) return;
  if (existing.status === status) return;

  const map = new Map(rows);
  map.set(toolUseId, { ...existing, status });
  rows = map;

  clearStaleTimer(toolUseId);
  armSweepTimer(toolUseId);
  emit();
};

/** Saca de golpe todas las filas de una sesion — al desmontar su bridge. */
export const clearSubagentsForSession = (sessionId: string): void => {
  let changed = false;
  const map = new Map(rows);
  for (const [toolUseId, row] of map) {
    if (row.sessionId !== sessionId) continue;
    map.delete(toolUseId);
    clearStaleTimer(toolUseId);
    clearSweepTimer(toolUseId);
    changed = true;
  }
  if (!changed) return;
  rows = map;
  emit();
};

/** Solo para tests: vacia el store entero sin pasar por una sesion. */
export const resetSubagentStoreForTests = (): void => {
  rows.forEach((_row, toolUseId) => {
    clearStaleTimer(toolUseId);
    clearSweepTimer(toolUseId);
  });
  rows = new Map();
  emit();
};

/** Devuelve el mapa de filas vivo, y re-renderiza cuando cambia. */
export const useSubagents = (): Map<string, SubagentRow> =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
