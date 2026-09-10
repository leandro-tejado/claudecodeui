import { useCallback, useRef, useState } from 'react';

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
 */
export default function UsageWindowIndicator() {
  const snapshot = useUsageWindow();
  const [open, setOpen] = useState(false);
  // El panel vive en un portal, así que necesita saber contra qué anclarse.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const toggle = useCallback(() => {
    setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen((value) => !value);
  }, []);

  // Grey ring until the first snapshot lands. Rendering zero would be a claim
  // about the account that we cannot make yet.
  if (!snapshot) {
    return (
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center" aria-hidden="true">
        <CircleProgress value={0} maxValue={1} size={22} strokeWidth={2.5} disableAnimation getColor={() => 'stroke-transparent'} />
      </div>
    );
  }

  const label = snapshot.bloqueado
    ? 'Ventana de 5 horas agotada'
    : `Ventana de 5 horas: ${snapshot.porcentaje}% usado${
        snapshot.resetsAt
          ? `, se renueva a las ${new Date(snapshot.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : ''
      }`;

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
          'flex h-6 w-6 items-center justify-center rounded-full outline-none',
          'hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
      >
        <CircleProgress
          value={snapshot.bloqueado ? snapshot.limite : snapshot.usados}
          maxValue={snapshot.limite}
          size={22}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <UsageWindowPopover
          snapshot={snapshot}
          anchor={anchor}
          anchorEl={buttonRef.current}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
