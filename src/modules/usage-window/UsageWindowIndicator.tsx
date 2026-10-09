import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/shared/utils';
import UsageWindowPopover from '@/modules/usage-window/UsageWindowPopover';
import { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
import {
  evaluarVentana,
  formatResetTime,
  type EstadoVentana,
} from '@/modules/usage-window/estadoVentana';

/**
 * La cuota en la cabecera: un anillo con el valor más alto de las dos ventanas.
 *
 * Variante A del boceto `design-system/visual-refs/09-octubre-vista-principal.html`
 * (aprobada el 9-oct): a la vista quedan el número y el anillo, nada más. «Dato
 * real», «resetea en…», la otra ventana y la otra cuenta viven en el medidor que
 * abre el clic (`UsageWindowPopover`). El color dice el estado: verde < 60,
 * ámbar 60–89, rojo ≥ 90.
 *
 * El `title` del botón sigue trayendo las dos ventanas con su antigüedad: es lo
 * que leen los lectores de pantalla y los escenarios e2e de `cuota/*`, y no
 * cambió con el rediseño.
 */

/** Cada cuánto el anillo revisa antigüedad por su cuenta, sin un push nuevo del WS. */
const TICK_MS = 60 * 1000;

function etiquetaVentana(nombre: string, estado: EstadoVentana): string {
  if (estado.tipo === 'sin-dato') return `${nombre}: sin dato`;
  if (estado.tipo === 'ventana-nueva') {
    return `${nombre}: ventana nueva (se renovó a las ${formatResetTime(estado.resetsAt)})`;
  }
  const pct = `${Math.round(estado.porcentaje)}%`;
  const antiguedad = estado.fresca ? 'real' : `hace ${estado.minutosAntiguedad} min`;
  const reset = estado.resetsAt !== null ? `, se renueva a las ${formatResetTime(estado.resetsAt)}` : '';
  return `${nombre}: ${pct} ${antiguedad}${reset}`;
}

/** "optimum" -> "Optimum": cómo se habla de la cuenta en el texto del anillo. */
function nombreCuenta(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

export type NivelAnillo = 'vacio' | 'ok' | 'alto' | 'corte';

/** Los cortes del boceto (escena 3): verde < 60, ámbar 60–89, rojo ≥ 90. */
export function nivelDePorcentaje(pct: number | null): NivelAnillo {
  if (pct === null) return 'vacio';
  if (pct >= 90) return 'corte';
  if (pct >= 60) return 'alto';
  return 'ok';
}

export const COLOR_NIVEL: Record<NivelAnillo, string> = {
  vacio: 'var(--ds-surface-3)',
  ok: 'var(--ds-signal-good)',
  alto: 'var(--ds-signal-warn)',
  corte: 'var(--ds-signal-bad)',
};

/** El porcentaje que manda: el más alto de las ventanas con dato. */
export function peorPorcentaje(...estados: EstadoVentana[]): number | null {
  const valores = estados.flatMap((e) => (e.tipo === 'dato' ? [e.porcentaje] : []));
  return valores.length ? Math.max(...valores) : null;
}

/** El anillo del boceto: un `conic-gradient` con el hueco del color de fondo. */
export function Anillo({ pct, size = 20, className }: { pct: number | null; size?: number; className?: string }) {
  const nivel = nivelDePorcentaje(pct);
  const valor = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <span
      aria-hidden="true"
      data-nivel={nivel}
      className={cn('relative inline-block flex-none rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${COLOR_NIVEL[nivel]} ${valor}%, var(--ds-surface-3) 0)`,
      }}
    >
      <span className="absolute rounded-full bg-background" style={{ inset: Math.max(2, Math.round(size / 8)) }} />
    </span>
  );
}

type Props = {
  /**
   * Cuenta de IA cuya cuota se muestra: la de la sesión activa. Sin ella es
   * optimum, que es lo único que existía antes de la Fase 3 del plan multi-cuenta.
   */
  cuenta?: string;
  /** Todas las cuentas registradas: el medidor muestra las dos ventanas de cada una. */
  cuentas?: string[];
  /** Secciones del medidor que no son de cuota (contexto de la sesión, servidor). */
  extra?: ReactNode;
};

export default function UsageWindowIndicator({ cuenta, cuentas, extra }: Props = {}) {
  const snapshot = useUsageWindow(cuenta);
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

  const estadoCincoHoras = evaluarVentana(snapshot?.fiveHour ?? null, now);
  const estadoSemanal = evaluarVentana(snapshot?.sevenDay ?? null, now);
  const peor = peorPorcentaje(estadoCincoHoras, estadoSemanal);

  // Los dos valores, siempre: nunca se esconde la ventana semanal, aunque no
  // tenga reset conocido o directamente no haya llegado ninguna lectura.
  const ventanas = `${etiquetaVentana('Ventana de 5 horas', estadoCincoHoras)} · ${etiquetaVentana('Semanal', estadoSemanal)}`;
  const label = cuenta ? `Cuenta ${nombreCuenta(cuenta)} · ${ventanas}` : ventanas;
  const textoVisible = peor === null ? '—' : String(Math.round(peor));

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        // El número visible va primero: axe pide que esté dentro del nombre accesible.
        aria-label={`${textoVisible} · ${label}`}
        title={label}
        data-testid="cuota-anillo"
        className={cn(
          'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-1.5 outline-none transition-colors',
          'hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/60',
          open && 'bg-accent',
        )}
      >
        <span
          className={cn('font-semibold tabular-nums', peor === null ? 'text-ds-faint' : 'text-ds-ink')}
          style={{ fontSize: 'var(--skin-text-xs)' }}
        >
          {textoVisible}
        </span>
        <Anillo pct={peor} />
      </button>

      {open && (
        <UsageWindowPopover
          snapshot={snapshot}
          cuenta={cuenta}
          cuentas={cuentas}
          now={now}
          anchor={anchor}
          anchorEl={buttonRef.current}
          onClose={() => setOpen(false)}
          extra={extra}
        />
      )}
    </div>
  );
}
