import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/utils';
import type { UsageWindowReading, UsageWindowSnapshot } from '@/modules/usage-window/types';

/** A reading older than this reads as "sin dato" rather than a stale percentage. */
const STALE_MS = 15 * 60 * 1000;

/** Local wall-clock time. The API reports the reset in its own zone, which is not ours. */
function localTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function remaining(resetsAt: number, now: number): string {
  const ms = resetsAt - now;
  if (ms <= 0) return 'ya';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `en ${mins} min`;
  return `en ${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function esFresca(reading: UsageWindowReading | null, now: number): reading is UsageWindowReading {
  return reading !== null && now - reading.leidoEn <= STALE_MS;
}

/** "real (hh:mm)" para una lectura fresca, "sin dato" pasados los 15 minutos. */
function estadoDeLectura(reading: UsageWindowReading | null, now: number): string {
  return esFresca(reading, now) ? `real (${localTime(reading.leidoEn)})` : 'sin dato';
}

type Props = {
  snapshot: UsageWindowSnapshot | null;
  /** Reloj del indicador: así el popover no necesita su propio timer para revisar frescura. */
  now: number;
  onClose: () => void;
  /** Rect del botón que lo abre, para anclarlo desde el portal. */
  anchor: DOMRect | null;
  /** El botón mismo, para no cerrar y reabrir en el mismo gesto. */
  anchorEl: HTMLElement | null;
};

export default function UsageWindowPopover({ snapshot, now, onClose, anchor, anchorEl }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      // El botón se excluye a propósito: sin esto el `mousedown` cierra y el
      // `click` que viene detrás vuelve a abrir, y el panel parpadea sin cerrarse.
      if (anchorEl?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // `mousedown` rather than `click`, so the toggle button's own click does not
    // reopen what this just closed.
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose, anchorEl]);

  const fiveHour = snapshot?.fiveHour ?? null;
  const sevenDay = snapshot?.sevenDay ?? null;
  const fiveHourFresca = esFresca(fiveHour, now);
  const sevenDayFresca = esFresca(sevenDay, now);

  /*
   * Va en un portal, no como hijo del botón.
   *
   * La cabecera lleva `backdrop-blur-sm`, y eso abre un stacking context
   * propio: dentro de él un `z-50` sólo compite con sus hermanos, así que el
   * panel quedaba entreverado con el texto del chat en vez de encima. Sacarlo
   * a `body` lo devuelve al contexto raíz; a cambio hay que anclarlo a mano
   * contra el rect del botón, y con `right` en vez de `left` para que no se
   * salga por el borde derecho en pantallas angostas.
   */
  const width = Math.min(352, window.innerWidth - 24);
  const top = (anchor?.bottom ?? 0) + 8;
  const right = Math.max(12, window.innerWidth - (anchor?.right ?? window.innerWidth));

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Detalle de la ventana de 5 horas"
      style={{ position: 'fixed', top, right, width }}
      className="z-[100] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Ventana de 5 horas</span>
        <span className={cn('text-sm font-semibold', fiveHourFresca && fiveHour.porcentaje >= 90 && 'text-red-500')}>
          {fiveHourFresca ? `~${Math.round(fiveHour.porcentaje)}%` : 'sin dato'}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{estadoDeLectura(fiveHour, now)}</p>

      {fiveHourFresca && fiveHour.resetsAt !== null && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se renueva a las {localTime(fiveHour.resetsAt)} ({remaining(fiveHour.resetsAt, now)})
        </p>
      )}

      <div className="mt-3 border-t border-border/60 pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Ventana semanal (7 d)</span>
          <span className="text-xs font-semibold">
            {sevenDayFresca ? `~${Math.round(sevenDay.porcentaje)}%` : 'sin dato'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {estadoDeLectura(sevenDay, now)}
          {sevenDayFresca && sevenDay.resetsAt !== null
            ? ` · se renueva a las ${localTime(sevenDay.resetsAt)} (${remaining(sevenDay.resetsAt, now)})`
            : ''}
        </p>
      </div>

      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
        Porcentaje real que reporta el SDK de Claude en cada turno, sin estimación local. Si no llegó
        una lectura nueva en los últimos 15 minutos, se muestra "sin dato" en vez de inventar un número.
      </p>
    </div>,
    document.body,
  );
}
