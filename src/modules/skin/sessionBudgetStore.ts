import { useSyncExternalStore } from 'react';

/*
 * Presupuesto de contexto por sesión, para el puntito del sidebar.
 *
 * Mismo store externo mínimo que `contextMeterStore` y `subagentStore`, pero
 * con una diferencia deliberada: `contextMeterStore` solo conoce la sesión
 * que se está mirando (`SkinContextMeterBridge` la apaga al desmontarse). El
 * sidebar necesita lo opuesto — el presupuesto de TODAS las sesiones vivas a
 * la vez, para poder pintar el punto de cada fila aunque no sea la que está
 * abierta. Por eso este store no tiene bridge propio: se publica desde el
 * mismo lugar que ya procesa `token_budget` en `useChatRealtimeHandlers.ts`,
 * al costado del filtro de sesión activa existente, sin tocarlo.
 */

export type SessionBudget = {
  /** Solo la entrada, igual que `contextMeterStore` — es contra esto que el CLI compacta. */
  inputTokens: number;
  /** `null` si el servidor no pudo afirmar el umbral: sin número no hay tramo que pintar. */
  compactAt: number | null;
};

let budgets = new Map<string, SessionBudget>();
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => budgets;

const readNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Publica el presupuesto de UNA sesión, la esté mirando alguien o no. */
export const publishSessionBudget = (
  sessionId: string | null | undefined,
  usage: Record<string, unknown> | null,
): void => {
  if (!sessionId) return;

  if (!usage) {
    if (!budgets.has(sessionId)) return;
    const next = new Map(budgets);
    next.delete(sessionId);
    budgets = next;
    emit();
    return;
  }

  const prev = budgets.get(sessionId);
  // Mismo criterio pegajoso que `contextMeterStore`: un frame sin el dato no
  // apaga el punto, conserva el último que se supo.
  const inputTokens = readNumber(usage.inputTokens) || prev?.inputTokens || 0;
  const compactAt = readNumber(usage.compactAt) || prev?.compactAt || null;

  if (prev && prev.inputTokens === inputTokens && prev.compactAt === compactAt) return;

  const next = new Map(budgets);
  next.set(sessionId, { inputTokens, compactAt });
  budgets = next;
  emit();
};

/** Solo para tests: vacía el store entero. */
export const resetSessionBudgetStoreForTests = (): void => {
  budgets = new Map();
  emit();
};

/** El mapa sessionId -> presupuesto, completo. Re-renderiza cuando cambia. */
export const useSessionBudgets = (): Map<string, SessionBudget> =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
