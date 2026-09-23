import { useEffect, useRef, useState } from 'react';

/**
 * Pure step function for the typewriter reveal: given how many characters of
 * a target string are shown right now (`mostrados`), how many should be
 * shown after one more animation frame (`objetivo` is the target length).
 *
 * Paces in ~8 steps while `activo` — at ~60fps that never lags more than
 * ~130ms behind the text actually received, well under the ~300ms budget —
 * and drains in ~3 steps once it is not, so the tail of a reply does not
 * visibly trail once the network has already delivered all of it.
 *
 * Ported from the app-optimum-mkt streaming plan (23-sep-2026, Fase 3): same
 * algorithm, copied rather than imported because CloudCLI and app-optimum-mkt
 * are separate repos with nothing shared between them.
 */
export function pasoRevelado(mostrados: number, objetivo: number, activo: boolean): number {
  const pendiente = objetivo - mostrados;
  if (pendiente <= 0) {
    return objetivo;
  }
  const paso = activo ? Math.max(2, Math.ceil(pendiente / 8)) : Math.ceil(pendiente / 3);
  return Math.min(objetivo, mostrados + paso);
}

function prefiereMovimientoReducido(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reveals `objetivo` progressively via requestAnimationFrame, persisting how
 * much is shown across renders (by component identity) so a target that keeps
 * growing — an SDK reply still streaming in — advances from where it left
 * off instead of restarting.
 *
 * `revelar=false` shows `objetivo` immediately with no animation at all: the
 * caller's signal for "this is history, not something that just arrived
 * live". `prefers-reduced-motion` does the same regardless of `revelar`.
 *
 * `arrancarVacio` (default `true`) decides only the very first paint, while
 * `revelar` is already true: whether the component starts at 0 and types the
 * whole thing in — right for a tmux reply, which lands as one complete block
 * with nothing shown yet — or starts already caught up to whatever `objetivo`
 * is at mount and only animates growth from there — right for the SDK path,
 * whose streaming placeholder already holds real accumulated text the first
 * time it renders, so there is nothing earlier to reveal. Content already on
 * screen at mount is never retroactively hidden; only text that was not there
 * yet gets typed in.
 */
export function useRevelado(objetivo: string, revelar: boolean, arrancarVacio = true): string {
  const [mostrados, setMostrados] = useState(() => (
    revelar && arrancarVacio && !prefiereMovimientoReducido() ? 0 : objetivo.length
  ));
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!revelar || prefiereMovimientoReducido()) {
      setMostrados(objetivo.length);
      return;
    }

    const tick = () => {
      setMostrados((actual) => {
        const siguiente = pasoRevelado(actual, objetivo.length, true);
        frameRef.current = siguiente < objetivo.length ? requestAnimationFrame(tick) : null;
        return siguiente;
      });
    };

    setMostrados((actual) => {
      if (actual < objetivo.length && frameRef.current === null) {
        frameRef.current = requestAnimationFrame(tick);
      }
      return actual;
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [objetivo, revelar]);

  return objetivo.slice(0, mostrados);
}
