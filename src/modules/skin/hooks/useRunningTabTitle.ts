import { useEffect } from 'react';

import { useBusySessionIdSet } from '@/shared/context/SessionProtectionContext';

/*
 * Marca el título de ESTA pestaña mientras su sesión está produciendo una
 * respuesta, que es lo que hace útil tener varias abiertas: de un vistazo se ve
 * cuál está trabajando sin entrar a mirarlas de a una.
 *
 * El filtro por la sesión de la pestaña es el punto. `useBusySessionIdSet`
 * trae TODAS las sesiones que corren en el servidor: marcar por "hay alguna
 * corriendo" pintaría las cuatro pestañas iguales y el indicador no diría nada.
 *
 * Convive con el `[Done] ` que antepone pageTitleNotification.ts, así que el
 * prefijo se saca desde donde esté y no sólo del principio.
 */

const RUNNING_PREFIX = '● ';

const stripPrefix = (title: string): string => title.replace(RUNNING_PREFIX, '');

/** Lo monta SkinHeader una sola vez por pestaña. */
export function useRunningTabTitle(sessionId: string | null): void {
  const busySessionIds = useBusySessionIdSet();
  const isRunning = Boolean(sessionId && busySessionIds.has(sessionId));

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const base = stripPrefix(document.title);
    document.title = isRunning ? `${RUNNING_PREFIX}${base}` : base;

    return () => {
      document.title = stripPrefix(document.title);
    };
  }, [isRunning]);
}
