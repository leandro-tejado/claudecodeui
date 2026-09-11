import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/utils';
import { CircleProgress } from '@/modules/usage-window/CircleProgress';
import UsageWindowPopover from '@/modules/usage-window/UsageWindowPopover';
import { useUsageWindow } from '@/modules/usage-window/useUsageWindow';

/**
 * The five-hour window, as a ring in the workspace header.
 *
 * It exists because the API only mentions the limit once it has already refused
 * a request, so without this the first sign of trouble is work stopping. All the
 * behaviour lives in this module; `WorkspaceHeader` only mounts it, which is
 * what keeps the upstream file to a one-line diff.
 *
 * The value it shows is the real percentage the SDK reports on `rate_limit_event`
 * — there is no local estimate to fall back on. A reading older than
 * `STALE_MS` is treated as no reading at all: the ring goes grey and says
 * "sin dato" rather than holding a number that may no longer be true.
 */

/** A reading older than this is shown as "sin dato" instead of a stale number. */
const STALE_MS = 15 * 60 * 1000;
/** How often the ring re-checks staleness on its own, without a new WS push. */
const TICK_MS = 60 * 1000;

export default function UsageWindowIndicator() {
  const snapshot = useUsageWindow();
  const [open, setOpen] = useState(false);
  // El panel vive en un portal, así que necesita saber contra qué anclarse.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Sin esto, una lectura que se puso vieja mientras la pestaña estaba
  // abierta se seguiría mostrando como fresca hasta el próximo mensaje.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const toggle = useCallback(() => {
    setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen((value) => !value);
  }, []);

  const fiveHour = snapshot?.fiveHour ?? null;
  const isFresh = fiveHour !== null && now - fiveHour.leidoEn <= STALE_MS;

  const label =
    isFresh && fiveHour
      ? `Ventana de 5 horas: ${Math.round(fiveHour.porcentaje)}% real${
          fiveHour.resetsAt
            ? `, se renueva a las ${new Date(fiveHour.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : ''
        }`
      : 'Ventana de 5 horas: sin dato';

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={cn(
          'flex flex-shrink-0 items-center gap-1 rounded-full outline-none',
          'hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center">
          {isFresh && fiveHour ? (
            <CircleProgress value={fiveHour.porcentaje} maxValue={100} size={22} strokeWidth={2.5} />
          ) : (
            // Sin dato: anillo gris. Mostrar un número acá sería afirmar algo
            // sobre la cuenta que no se puede sostener.
            <CircleProgress
              value={0}
              maxValue={1}
              size={22}
              strokeWidth={2.5}
              disableAnimation
              getColor={() => 'stroke-transparent'}
            />
          )}
        </span>
        {/* El porcentaje en texto, con el mismo markup que el anillo de
            contexto: los dos indicadores tienen que leerse como un par, y en
            pantallas chicas los dos números se esconden a la vez. */}
        {isFresh && fiveHour && (
          <span
            className="hidden tabular-nums text-muted-foreground sm:inline"
            style={{ fontSize: 'var(--skin-text-xs)' }}
          >
            {Math.round(fiveHour.porcentaje)}%
          </span>
        )}
      </button>

      {open && (
        <UsageWindowPopover
          snapshot={snapshot}
          now={now}
          anchor={anchor}
          anchorEl={buttonRef.current}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
