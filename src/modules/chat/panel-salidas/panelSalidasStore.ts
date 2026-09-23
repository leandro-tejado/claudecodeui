import { useSyncExternalStore } from 'react';

/**
 * Persisted open/closed preference for the Salidas panel — same
 * `useSyncExternalStore` + try/catch-localStorage shape `skinUiStore.ts`
 * uses for the Files panel, kept as its own tiny store because Salidas is
 * chat-scoped, not skin-scoped.
 */

const STORAGE_KEY = 'chat:salidas-panel-open';

const readInitial = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage blocked: start closed, same fallback skinUiStore uses.
    return false;
  }
};

const persist = (value: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // No persistence: the preference lasts the tab. Not an error.
  }
};

let open = readInitial();
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

const getSnapshot = () => open;

/** Called by the panel's own header toggle. */
export const togglePanelSalidas = () => {
  open = !open;
  persist(open);
  emit();
};

/** Devuelve si el panel de Salidas está abierto; se re-renderiza cuando cambia. */
export const usePanelSalidasOpen = (): boolean => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
