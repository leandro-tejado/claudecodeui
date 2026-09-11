import { useSyncExternalStore } from 'react';

/*
 * Contexto de la sesión que se está mirando, para la cabecera.
 *
 * El dato nace abajo del todo —el chat lo recibe por WebSocket— y se dibuja
 * arriba del todo, en el header, que es otra rama del árbol. Subir el estado
 * hasta el ancestro común obligaría a tocar componentes de upstream, que es lo
 * que el rediseño evita. Mismo store externo mínimo que `skinUiStore`.
 *
 * **El total se conserva; el consumo se reemplaza.** El servidor se abstiene de
 * afirmar la ventana cuando el id del modelo es ambiguo (`claude-opus-5` nombra
 * tanto la de 200K como la de 1M) y manda `total: null`. El que sí la sabe es
 * el lector de transcripts, porque tiene `identity.modelId`. Así que un total
 * nulo significa "seguí usando el que tenías", no "ya no se sabe": pisarlo con
 * null apagaría el anillo en cada turno y volvería a encenderlo en cada
 * recarga, que es la variante nerviosa del bug del 11-sep.
 */

export type ContextMeterState = {
  used: number;
  /** `null` mientras nadie pudo afirmar la ventana; el anillo no se dibuja. */
  total: number | null;
  onShowDetails: (() => void) | null;
};

const readNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Saca el consumo del payload crudo, que cambia de forma según el proveedor. */
const readUsed = (usage: Record<string, unknown>): number => {
  const breakdown =
    usage.breakdown && typeof usage.breakdown === 'object'
      ? (usage.breakdown as Record<string, unknown>)
      : null;

  return (
    readNumber(usage.used)
    || readNumber(usage.inputTokens ?? breakdown?.input) + readNumber(usage.outputTokens ?? breakdown?.output)
  );
};

let state: ContextMeterState | null = null;
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

const getSnapshot = () => state;

/** Publica el budget de la sesión activa. `usage` nulo apaga el indicador. */
export const publishContextMeter = (
  usage: Record<string, unknown> | null,
  onShowDetails: (() => void) | null,
): void => {
  if (!usage) {
    if (state === null) return;
    state = null;
    emit();
    return;
  }

  const used = readUsed(usage);
  const total = readNumber(usage.total) || state?.total || null;

  // El composer re-renderiza en cada tecla; sin esta comparación el header
  // re-renderizaría con él aunque los números no se hayan movido.
  if (state && state.used === used && state.total === total && state.onShowDetails === onShowDetails) {
    return;
  }

  state = { used, total, onShowDetails };
  emit();
};

/** Devuelve el contexto de la sesión activa y re-renderiza cuando cambia. */
export const useContextMeter = (): ContextMeterState | null =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
