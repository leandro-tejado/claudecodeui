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
};

const STORAGE_KEY = 'skin:sidebar-collapsed';

const readInitial = (): SkinUiState => {
  try {
    return { sidebarCollapsed: localStorage.getItem(STORAGE_KEY) === '1' };
  } catch {
    // Storage bloqueado: se arranca desplegado, que es el estado útil.
    return { sidebarCollapsed: false };
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
  try {
    localStorage.setItem(STORAGE_KEY, state.sidebarCollapsed ? '1' : '0');
  } catch {
    // Sin persistencia el colapso dura lo que la pestaña. No es un error.
  }
  emit();
};

/** Devuelve el estado de UI del skin y se re-renderiza cuando cambia. */
export const useSkinUi = (): SkinUiState => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
