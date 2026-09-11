import { useSyncExternalStore } from 'react';

/*
 * ¿Entra el panel de archivos sin dejar el chat inservible?
 *
 * Con el editor abierto son cuatro columnas —sidebar, chat, editor, árbol— y
 * abajo de ~1400px el chat queda en una franja donde no se puede escribir. Con
 * el editor cerrado el umbral baja.
 *
 * Esto oculta, no cierra: la preferencia del usuario (`filesPanelOpen`) no se
 * toca, así que al agrandar la ventana el panel vuelve solo. Apagarla sería
 * destructivo — el panel quedaría cerrado sin que nadie lo haya cerrado.
 *
 * `matchMedia` y no `resize`: el navegador avisa al cruzar el umbral en vez de
 * en cada píxel del arrastre, y un `MediaQueryList` por consulta alcanza para
 * todos los que pregunten.
 */

const WITH_EDITOR_QUERY = '(min-width: 1400px)';
const WITHOUT_EDITOR_QUERY = '(min-width: 1100px)';

const queries = new Map<string, MediaQueryList>();

const readQuery = (query: string): MediaQueryList => {
  const cached = queries.get(query);
  if (cached) return cached;

  const created = window.matchMedia(query);
  queries.set(query, created);
  return created;
};

const subscribeTo = (query: string) => (onChange: () => void): (() => void) => {
  const media = readQuery(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const getSnapshotOf = (query: string) => (): boolean => readQuery(query).matches;

const subscribeWithEditor = subscribeTo(WITH_EDITOR_QUERY);
const subscribeWithoutEditor = subscribeTo(WITHOUT_EDITOR_QUERY);
const snapshotWithEditor = getSnapshotOf(WITH_EDITOR_QUERY);
const snapshotWithoutEditor = getSnapshotOf(WITHOUT_EDITOR_QUERY);

/** True mientras la ventana tenga ancho para mostrar el árbol sin asfixiar al chat. */
export function useFilesPanelRoom(editorOpen: boolean): boolean {
  const roomWithEditor = useSyncExternalStore(subscribeWithEditor, snapshotWithEditor);
  const roomWithoutEditor = useSyncExternalStore(subscribeWithoutEditor, snapshotWithoutEditor);

  return editorOpen ? roomWithEditor : roomWithoutEditor;
}
