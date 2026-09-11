import { useSyncExternalStore } from 'react';

/*
 * Estado de UI compartido del skin.
 *
 * El botón que colapsa el sidebar vive en la cabecera y el que se colapsa es el
 * sidebar: son dos ramas distintas del árbol. Levantar el estado hasta el
 * ancestro común obligaría a tocar componentes de upstream, que es justo lo que
 * el rediseño evita. Un store externo mínimo lo resuelve sin pedirle nada a
 * upstream y sin sumar una dependencia.
 *
 * `useSyncExternalStore` es la API de React para esto: el snapshot tiene que ser
 * estable entre renders, así que se guarda el objeto y sólo se reemplaza cuando
 * algo cambia de verdad.
 */

export type SkinUiState = {
  sidebarCollapsed: boolean;
  /** Preferencia del usuario, no visibilidad: el panel puede estar abierto y oculto por falta de ancho. */
  filesPanelOpen: boolean;
  filesPanelWidth: number;
};

const STORAGE_KEY = 'skin:sidebar-collapsed';
const FILES_OPEN_KEY = 'skin:files-panel-open';
const FILES_WIDTH_KEY = 'skin:files-panel-width';

export const FILES_PANEL_MIN_WIDTH = 240;
export const FILES_PANEL_MAX_WIDTH = 640;
const FILES_PANEL_DEFAULT_WIDTH = 320;

const clampFilesWidth = (value: number): number => (
  Math.min(FILES_PANEL_MAX_WIDTH, Math.max(FILES_PANEL_MIN_WIDTH, Math.round(value)))
);

const readInitial = (): SkinUiState => {
  try {
    const storedWidth = Number(localStorage.getItem(FILES_WIDTH_KEY));
    return {
      sidebarCollapsed: localStorage.getItem(STORAGE_KEY) === '1',
      filesPanelOpen: localStorage.getItem(FILES_OPEN_KEY) === '1',
      filesPanelWidth: Number.isFinite(storedWidth) && storedWidth > 0
        ? clampFilesWidth(storedWidth)
        : FILES_PANEL_DEFAULT_WIDTH,
    };
  } catch {
    // Storage bloqueado: se arranca desplegado y sin panel, que es el estado útil.
    return {
      sidebarCollapsed: false,
      filesPanelOpen: false,
      filesPanelWidth: FILES_PANEL_DEFAULT_WIDTH,
    };
  }
};

const persist = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin persistencia la preferencia dura lo que la pestaña. No es un error.
  }
};

let state: SkinUiState = readInitial();
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

export const toggleSidebarCollapsed = () => {
  state = { ...state, sidebarCollapsed: !state.sidebarCollapsed };
  persist(STORAGE_KEY, state.sidebarCollapsed ? '1' : '0');
  emit();
};

/** Lo llama el botón de archivos de la cabecera. */
export const toggleFilesPanel = () => {
  state = { ...state, filesPanelOpen: !state.filesPanelOpen };
  persist(FILES_OPEN_KEY, state.filesPanelOpen ? '1' : '0');
  emit();
};

/** Lo llama el botón de cerrar del propio panel. */
export const closeFilesPanel = () => {
  if (!state.filesPanelOpen) return;
  state = { ...state, filesPanelOpen: false };
  persist(FILES_OPEN_KEY, '0');
  emit();
};

/** La manija de arrastre del panel; el ancho se guarda ya acotado. */
export const setFilesPanelWidth = (width: number) => {
  const next = clampFilesWidth(width);
  if (next === state.filesPanelWidth) return;
  state = { ...state, filesPanelWidth: next };
  persist(FILES_WIDTH_KEY, String(next));
  emit();
};

/** Devuelve el estado de UI del skin y se re-renderiza cuando cambia. */
export const useSkinUi = (): SkinUiState => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
