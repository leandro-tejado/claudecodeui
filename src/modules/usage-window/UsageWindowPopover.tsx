import { useEffect, useRef } from 'react';

import { cn } from '@/shared/utils';
import type { UsageWindowSnapshot } from '@/modules/usage-window/types';

const nf = new Intl.NumberFormat('es-AR');

/** Local wall-clock time. The API reports the reset in its own zone, which is not ours. */
function localTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function remaining(resetsAt: number): string {
  const ms = resetsAt - Date.now();
  if (ms <= 0) return 'ya';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `en ${mins} min`;
  return `en ${Math.floor(mins / 60)} h ${mins % 60} min`;
}

type Props = {
  snapshot: UsageWindowSnapshot;
  onClose: () => void;
};

export default function UsageWindowPopover({ snapshot, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // `mousedown` rather than `click`, so the toggle button's own click does not
    // reopen what this just closed.
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  const medido = snapshot.calibradoDe.startsWith('medido');
  const sesiones = snapshot.porSesion.slice(0, 8);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Detalle de la ventana de 5 horas"
      className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Ventana de 5 horas</span>
        <span className={cn('text-sm font-semibold', snapshot.porcentaje >= 90 && 'text-red-500')}>
          {snapshot.bloqueado ? 'agotada' : `~${snapshot.porcentaje}%`}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {nf.format(snapshot.usados)} de {nf.format(snapshot.limite)} tokens de salida · {nf.format(snapshot.turnos)}{' '}
        turnos
      </p>

      {snapshot.resetsAt !== null && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se renueva a las {localTime(snapshot.resetsAt)} ({remaining(snapshot.resetsAt)})
        </p>
      )}

      {snapshot.porModelo.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Por modelo</p>
          {snapshot.porModelo.map((m) => (
            <div key={m.model} className="flex justify-between gap-2 py-0.5 text-xs">
              <span className="truncate">{m.model}</span>
              <span className="flex-shrink-0 tabular-nums text-muted-foreground">{nf.format(m.out)}</span>
            </div>
          ))}
        </div>
      )}

      {sesiones.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Por sesión ({snapshot.porSesion.length} activas)
          </p>
          {sesiones.map((s) => (
            <div key={s.file} className="flex justify-between gap-2 py-0.5 text-xs">
              <span className="truncate" title={s.file}>
                {s.isSubagent ? '↳ ' : ''}
                {s.project}
              </span>
              <span className="flex-shrink-0 tabular-nums text-muted-foreground">{nf.format(s.out)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
        {medido
          ? `Límite medido el ${snapshot.calibradoDe.slice(7)}, a partir de un rechazo real de la API.`
          : 'Límite estimado. Se recalibra solo la primera vez que la API rechace un pedido.'}{' '}
        No cubre la ventana semanal.
      </p>
    </div>
  );
}
