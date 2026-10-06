import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/utils';
import { useUsageDetalle } from '@/modules/usage-window/useUsageDetalle';
import type { GobernadorEstado, UsageDetalle, UsageWindowSnapshot } from '@/modules/usage-window/types';
import { evaluarVentana, formatResetTime, type EstadoVentana } from '@/modules/usage-window/estadoVentana';

const COLOR_SEMAFORO: Record<GobernadorEstado['color'], string> = {
  verde: 'text-emerald-500',
  ambar: 'text-amber-500',
  rojo: 'text-red-500',
};

function nombreSesion(cwd: string): string {
  const partes = cwd.split('/').filter(Boolean);
  return partes[partes.length - 1] ?? cwd;
}

function remaining(resetsAt: number, now: number): string {
  const ms = resetsAt - now;
  if (ms <= 0) return 'ya';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `en ${mins} min`;
  return `en ${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** "~42%" con datos, "ventana nueva" pasado el reset, "sin dato" sin ninguna lectura — nunca "sin dato" habiendo una. */
function textoPorcentaje(estado: EstadoVentana): string {
  if (estado.tipo === 'dato') return `~${Math.round(estado.porcentaje)}%`;
  if (estado.tipo === 'ventana-nueva') return 'ventana nueva';
  return 'sin dato';
}

/** "real (hh:mm)" fresca, "hace N min (hh:mm)" vieja pero con dato, "ventana nueva..." pasado el reset, "sin dato" sin lectura. */
function textoAntiguedad(estado: EstadoVentana): string {
  if (estado.tipo === 'sin-dato') return 'sin dato';
  if (estado.tipo === 'ventana-nueva') return `ventana nueva, se renovó a las ${formatResetTime(estado.resetsAt)}`;
  const hora = formatResetTime(estado.leidoEn);
  return estado.fresca ? `real (${hora})` : `hace ${estado.minutosAntiguedad} min (${hora})`;
}

type Props = {
  snapshot: UsageWindowSnapshot | null;
  /** Cuenta de IA a la que pertenece esta cuota; sin ella, la de siempre (optimum) y el título no la nombra. */
  cuenta?: string;
  /** Reloj del indicador: así el popover no necesita su propio timer para revisar frescura. */
  now: number;
  onClose: () => void;
  /** Rect del botón que lo abre, para anclarlo desde el portal. */
  anchor: DOMRect | null;
  /** El botón mismo, para no cerrar y reabrir en el mismo gesto. */
  anchorEl: HTMLElement | null;
};

export default function UsageWindowPopover({ snapshot, cuenta, now, onClose, anchor, anchorEl }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { detalle, gobernador } = useUsageDetalle(true, cuenta);

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

  const estadoCinco = evaluarVentana(snapshot?.fiveHour ?? null, now);
  const estadoSemanal = evaluarVentana(snapshot?.sevenDay ?? null, now);

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
        <span className="text-sm font-semibold">
          Ventana de 5 horas
          {cuenta && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · cuenta {cuenta.charAt(0).toUpperCase() + cuenta.slice(1)}
            </span>
          )}
        </span>
        <span
          className={cn(
            'text-sm font-semibold',
            estadoCinco.tipo === 'dato' && estadoCinco.porcentaje >= 90 && 'text-red-500',
          )}
        >
          {textoPorcentaje(estadoCinco)}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{textoAntiguedad(estadoCinco)}</p>

      {estadoCinco.tipo === 'dato' && estadoCinco.resetsAt !== null && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se renueva a las {formatResetTime(estadoCinco.resetsAt)} ({remaining(estadoCinco.resetsAt, now)})
        </p>
      )}

      <div className="mt-3 border-t border-border/60 pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Ventana semanal (7 d)</span>
          <span className="text-xs font-semibold">{textoPorcentaje(estadoSemanal)}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {textoAntiguedad(estadoSemanal)}
          {estadoSemanal.tipo === 'dato' && estadoSemanal.resetsAt !== null
            ? ` · se renueva a las ${formatResetTime(estadoSemanal.resetsAt)} (${remaining(estadoSemanal.resetsAt, now)})`
            : ''}
        </p>
      </div>

      {gobernador && (
        <div className="mt-3 border-t border-border/60 pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Ritmo del gobernador</span>
            <span className={cn('text-xs font-semibold', COLOR_SEMAFORO[gobernador.color])}>
              {gobernador.color}
              {gobernador.pace !== null ? ` · ${Math.round(gobernador.pace)}%` : ''}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{gobernador.motivo}</p>
        </div>
      )}

      <Contribuyendo detalle={detalle} />

      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
        Porcentaje real que reporta el SDK de Claude en cada turno, sin estimación local. "Sin dato" es
        no tener ninguna lectura todavía: una lectura vieja se sigue mostrando, con su antigüedad.
      </p>
    </div>,
    document.body,
  );
}

/** El bloque "qué está contribuyendo": top de sesiones, subagentes, contexto alto y skills. */
function Contribuyendo({ detalle }: { detalle: UsageDetalle | null }) {
  if (!detalle) return null;

  return (
    <div className="mt-3 border-t border-border/60 pt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Qué está contribuyendo</span>
        <span className="text-xs font-semibold">${detalle.usdTotal.toFixed(2)}</span>
      </div>

      {detalle.topSesiones.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {detalle.topSesiones.map((sesion) => (
            <li key={sesion.sid} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground" title={sesion.cwd}>
                {nombreSesion(sesion.cwd)}
              </span>
              <span className="tabular-nums">{Math.round(sesion.pct)}%</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        Subagentes: {Math.round(detalle.pctSubagentes)}% · Contexto &gt;150K: {Math.round(detalle.pctCtxAlto)}%
      </p>

      {detalle.porSkill.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {detalle.porSkill.map((skill) => (
            <li key={skill.skill} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground" title={skill.skill}>
                {skill.skill}
              </span>
              <span className="tabular-nums">{Math.round(skill.pct)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
