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

/*
 * Anchos del panel, que el usuario ajusta arrastrando: el del panel entero
 * (manija en su borde izquierdo) y el de la columna de la lista (manija entre
 * la lista y la vista previa). Mismo patrón que `filesPanelWidth` en
 * `skinUiStore.ts`: snapshot estable, ancho guardado ya acotado.
 */

export type PanelSalidasAnchos = { panel: number; lista: number };

const PANEL_WIDTH_KEY = 'chat:salidas-panel-width';
const LISTA_WIDTH_KEY = 'chat:salidas-lista-width';

export const SALIDAS_PANEL_MIN_WIDTH = 280;
export const SALIDAS_PANEL_MAX_WIDTH = 1400;
export const SALIDAS_LISTA_MIN_WIDTH = 96;
export const SALIDAS_LISTA_MAX_WIDTH = 360;
const SALIDAS_PANEL_DEFAULT_WIDTH = 320;
const SALIDAS_LISTA_DEFAULT_WIDTH = 144;

const acotar = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, Math.round(value)))
);

const leerAncho = (key: string, fallback: number, min: number, max: number): number => {
  try {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? acotar(stored, min, max) : fallback;
  } catch {
    return fallback;
  }
};

const persistirAncho = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sin persistencia el ancho dura lo que la pestaña. No es un error.
  }
};

let anchos: PanelSalidasAnchos = {
  panel: leerAncho(PANEL_WIDTH_KEY, SALIDAS_PANEL_DEFAULT_WIDTH, SALIDAS_PANEL_MIN_WIDTH, SALIDAS_PANEL_MAX_WIDTH),
  lista: leerAncho(LISTA_WIDTH_KEY, SALIDAS_LISTA_DEFAULT_WIDTH, SALIDAS_LISTA_MIN_WIDTH, SALIDAS_LISTA_MAX_WIDTH),
};
const anchosListeners = new Set<() => void>();

const subscribeAnchos = (listener: () => void) => {
  anchosListeners.add(listener);
  return () => {
    anchosListeners.delete(listener);
  };
};

const getAnchos = () => anchos;

/** La manija del borde izquierdo del panel. */
export const setSalidasPanelWidth = (width: number) => {
  const next = acotar(width, SALIDAS_PANEL_MIN_WIDTH, SALIDAS_PANEL_MAX_WIDTH);
  if (next === anchos.panel) return;
  anchos = { ...anchos, panel: next };
  persistirAncho(PANEL_WIDTH_KEY, next);
  anchosListeners.forEach((listener) => listener());
};

/** La manija entre la lista y la vista previa. */
export const setSalidasListaWidth = (width: number) => {
  const next = acotar(width, SALIDAS_LISTA_MIN_WIDTH, SALIDAS_LISTA_MAX_WIDTH);
  if (next === anchos.lista) return;
  anchos = { ...anchos, lista: next };
  persistirAncho(LISTA_WIDTH_KEY, next);
  anchosListeners.forEach((listener) => listener());
};

/** Devuelve los anchos del panel de Salidas; se re-renderiza cuando cambian. */
export const usePanelSalidasAnchos = (): PanelSalidasAnchos => (
  useSyncExternalStore(subscribeAnchos, getAnchos, getAnchos)
);
