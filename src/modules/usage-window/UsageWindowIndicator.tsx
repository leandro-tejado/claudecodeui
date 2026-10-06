import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/utils';
import UsageWindowPopover from '@/modules/usage-window/UsageWindowPopover';
import { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
import {
  evaluarVentana,
  formatResetTime,
  remainingLabel,
  type EstadoVentana,
} from '@/modules/usage-window/estadoVentana';

/**
 * Las ventanas de 5 horas y semanal, como dos barras en el header.
 *
 * Existe porque la API solo avisa el límite una vez que ya rechazó un pedido,
 * así que sin esto la primera señal de problema es el trabajo frenando. Todo
 * el comportamiento vive en este módulo; `SkinHeader` solo lo monta, que es
 * lo que mantiene a un diff de una línea el archivo de arriba.
 *
 * El valor que muestra es el porcentaje real que reporta el SDK — no hay una
 * estimación local de respaldo. Pero una lectura vieja NO se trata como "sin
 * dato": se sigue mostrando, con su antigüedad (`evaluarVentana`). "Sin dato"
 * es únicamente el estado de no tener ninguna lectura, y se rotula "sin leer
 * aún" con la barra vacía — nunca un 0% que parece un dato real (Fase 11,
 * paso 4, boceto `design-system/visual-refs/05-octubre-header-barra.html`).
 * Cuando la ventana ya pasó su hora de reset se muestra "ventana nueva" en
 * vez de un porcentaje que ya no describe la ventana actual.
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

/** El umbral de alerta de `branding.md`: "Alerta signal-warn: cuota > 75%". */
const UMBRAL_ALERTA = 75;

/** Línea chica de detalle (antigüedad + cuenta regresiva del reset), solo visible en ≥ sm. */
function detalleVentana(estado: EstadoVentana, now: number): string {
  if (estado.tipo === 'sin-dato') return 'sin leer aún';
  if (estado.tipo === 'ventana-nueva') return `se renovó a las ${formatResetTime(estado.resetsAt)}`;
  const antiguedad = estado.fresca ? 'dato real' : `hace ${estado.minutosAntiguedad} min`;
  if (estado.resetsAt === null) return antiguedad;
  return `${antiguedad} · resetea en ${remainingLabel(estado.resetsAt, now)}`;
}

/**
 * Una ventana de cuota como barra + %, según el boceto de la Fase 11 (paso 4):
 * nunca un 0% fantasma — sin lectura la barra queda vacía y el texto dice
 * "sin leer aún"; con una ventana ya reseteada, "ventana nueva".
 */
function VentanaBarra({ rotulo, estado, now }: { rotulo: string; estado: EstadoVentana; now: number }) {
  const esDato = estado.tipo === 'dato';
  const pct = esDato ? Math.max(0, Math.min(100, estado.porcentaje)) : 0;
  const alerta = esDato && estado.porcentaje >= UMBRAL_ALERTA;
  const stale = esDato && !estado.fresca;

  return (
    <div className="flex min-w-0 flex-shrink-0 items-center gap-1.5">
      <div className="h-[5px] w-8 flex-none overflow-hidden rounded-full bg-ds-surface-3 sm:w-10" aria-hidden="true">
        {esDato && (
          <div
            className={cn(
              'h-full rounded-full',
              alerta ? 'bg-ds-signal-warn' : 'bg-ds-primary',
              stale && 'opacity-60',
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="whitespace-nowrap text-ds-muted" style={{ fontSize: 'var(--skin-text-xs)' }}>
          <span className="hidden sm:inline">{rotulo}{' '}</span>
          <b className={cn('font-semibold text-ds-ink', stale && 'opacity-60')}>
            {esDato
              ? `${Math.round(estado.porcentaje)}%`
              : estado.tipo === 'ventana-nueva'
                ? 'ventana nueva'
                : 'sin leer aún'}
          </b>
        </span>
        <span className="hidden whitespace-nowrap text-ds-faint sm:inline" style={{ fontSize: '10px' }}>
          {detalleVentana(estado, now)}
        </span>
      </div>
    </div>
  );
}

type Props = {
  /**
   * Cuenta de IA cuya cuota se muestra: la de la sesión activa. Sin ella es
   * optimum, que es lo único que existía antes de la Fase 3 del plan multi-cuenta.
   */
  cuenta?: string;
};

export default function UsageWindowIndicator({ cuenta }: Props = {}) {
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

  // Los dos valores, siempre: nunca se esconde la ventana semanal, aunque no
  // tenga reset conocido o directamente no haya llegado ninguna lectura.
  const ventanas = `${etiquetaVentana('Ventana de 5 horas', estadoCincoHoras)} · ${etiquetaVentana('Semanal', estadoSemanal)}`;
  const label = cuenta ? `Cuenta ${nombreCuenta(cuenta)} · ${ventanas}` : ventanas;

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
          'flex flex-shrink-0 items-center gap-3 rounded-md outline-none',
          'hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
      >
        <VentanaBarra rotulo="Ventana 5h" estado={estadoCincoHoras} now={now} />
        <VentanaBarra rotulo="Semanal" estado={estadoSemanal} now={now} />
      </button>

      {open && (
        <UsageWindowPopover
          snapshot={snapshot}
          cuenta={cuenta}
          now={now}
          anchor={anchor}
          anchorEl={buttonRef.current}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
