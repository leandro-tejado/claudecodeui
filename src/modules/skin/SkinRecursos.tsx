import { HardDrive, MemoryStick } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { AMBER_AT, trackClass } from '@/modules/skin/compactBarThresholds';
import { useRecursos } from '@/modules/skin/useRecursos';
import { cn } from '@/shared/utils';

/*
 * RAM y disco en la cabecera (Fase 3 del plan
 * `16-septiembre-os-orquestador-y-recursos.md`).
 *
 * Dos chips en pantallas anchas, uno solo (el peor de los dos) debajo de
 * 640px — el mismo umbral `sm:` de Tailwind que ya usa el resto de la
 * cabecera para esconder texto. El popover es el que dice los números
 * crudos: los chips solo dan el color y el %, igual que la barra de
 * compactación no repite el token exacto en la fila.
 *
 * El rojo de RAM no es el 95% genérico de `compactBarThresholds`: es el
 * techo del gobernador (90%, `RAM_CEILING_PERCENT`) que ya bloquea sesiones
 * nuevas — a esa altura no es "cerca del límite", ya está sobre él. El
 * ámbar sí se reusa tal cual. Disco no tiene un techo propio, así que usa
 * la escala genérica completa.
 */

const gbFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatGb(value: number | null): string {
  return value === null ? '—' : gbFormatter.format(value);
}

/** 0 = verde, 1 = ámbar, 2 = rojo — para comparar severidad entre RAM y disco. */
type Severidad = 0 | 1 | 2;

function severidadDeClase(colorClass: string): Severidad {
  if (colorClass === 'text-red-500') return 2;
  if (colorClass === 'text-amber-500') return 1;
  return 0;
}

function colorRam(pct: number | null, techo: number): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= techo) return 'text-red-500';
  if (pct >= AMBER_AT) return 'text-amber-500';
  return 'text-primary';
}

function colorDisco(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  return trackClass(pct).replace('bg-', 'text-');
}

function ChipContent({ pct, colorClass }: { pct: number | null; colorClass: string }) {
  return (
    <span className={cn('tabular-nums', colorClass)} style={{ fontSize: 'var(--skin-text-xs)' }}>
      {pct === null ? '—' : `${Math.round(pct)}%`}
    </span>
  );
}

export default function SkinRecursos() {
  const snapshot = useRecursos();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen((value) => !value);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current && !popoverRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const techo = snapshot?.techoRam ?? 90;
  const ramPct = snapshot?.ram.porcentajePct ?? null;
  const discoPct = snapshot?.disco.usadoPct ?? null;
  const ramColor = colorRam(ramPct, techo);
  const discoColor = colorDisco(discoPct);

  // El chip combinado muestra el número del más severo, no un promedio ni el
  // % más alto sin más: RAM=91/Disco=50 tiene que leerse rojo (RAM sobre su
  // techo), no ámbar por estar "cerca" de un 95 genérico que no le aplica.
  const ramEsPeor = severidadDeClase(ramColor) >= severidadDeClase(discoColor);
  const peorPct = ramEsPeor ? ramPct : discoPct;
  const peorColor = ramEsPeor ? ramColor : discoColor;

  const label = 'Recursos del servidor: RAM y disco';

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className="flex items-center gap-1.5 rounded-full outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {/* Un solo chip (el peor de los dos) por debajo de 640px. */}
        <span className="flex items-center gap-1 sm:hidden">
          <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
          <ChipContent pct={peorPct} colorClass={peorColor} />
        </span>

        {/* Los dos chips, discretos, a partir de 640px. */}
        <span className="hidden items-center gap-1 sm:flex">
          <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
          <ChipContent pct={ramPct} colorClass={ramColor} />
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
          <ChipContent pct={discoPct} colorClass={discoColor} />
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Detalle de recursos del servidor"
            style={{
              position: 'fixed',
              top: (anchor?.bottom ?? 0) + 8,
              right: Math.max(12, window.innerWidth - (anchor?.right ?? window.innerWidth)),
              width: Math.min(280, window.innerWidth - 24),
            }}
            className="z-[100] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">RAM</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatGb(snapshot?.ram.usadaGb ?? null)} de {formatGb(snapshot?.ram.totalGb ?? null)} GB
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">Disco</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatGb(snapshot?.disco.usadoGb ?? null)} de {formatGb(snapshot?.disco.totalGb ?? null)} GB
              </span>
            </div>
            <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
              {snapshot ? `${snapshot.sesionesTmux} sesiones · techo ${snapshot.techoRam}%` : 'sin dato'}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
