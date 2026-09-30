import { useEffect } from 'react';

/*
 * El título de la pestaña: `LT · <sesión>`.
 *
 * Con varias pestañas abiertas, una por sesión de tmux, lo único que las
 * distinguía era el favicon y un "LT Space" repetido. El nombre de la sesión
 * en el título es lo que permite saltar a la correcta sin entrar a mirarlas.
 *
 * Antes lo ponía `SidebarProjectList`, que es del sidebar de upstream: desde que
 * el skin lo reemplazó nadie escribía el título y quedaba el de `index.html`.
 *
 * Además marca con `● ` la pestaña cuya sesión está produciendo una respuesta.
 * Va en el mismo hook y no en uno aparte porque los dos escriben
 * `document.title`: separados, el que corre segundo pisaba al primero.
 *
 * El `[Done] ` que antepone pageTitleNotification.ts se respeta: ese módulo lo
 * saca solo cuando el usuario vuelve, y reescribir el título no debe borrarlo
 * antes de tiempo.
 */

const APP_TITLE = 'LT';
const RUNNING_PREFIX = '● ';
const DONE_PREFIX = '[Done] ';

export const composeTabTitle = (label: string | null, isRunning: boolean): string => {
  const trimmed = label?.trim();
  const base = trimmed ? `${APP_TITLE} · ${trimmed}` : APP_TITLE;
  return isRunning ? `${RUNNING_PREFIX}${base}` : base;
};

/** Lo monta SkinSidebar una sola vez por pestaña: es el que conoce el nombre de tmux de la sesión. */
export function useTabTitle(label: string | null, isRunning: boolean): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const done = document.title.startsWith(DONE_PREFIX) ? DONE_PREFIX : '';
    document.title = `${done}${composeTabTitle(label, isRunning)}`;
  }, [label, isRunning]);
}
