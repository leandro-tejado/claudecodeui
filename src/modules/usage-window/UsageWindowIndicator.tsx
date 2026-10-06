import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/utils';
import { CircleProgress } from '@/modules/usage-window/CircleProgress';
import UsageWindowPopover from '@/modules/usage-window/UsageWindowPopover';
import { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
import { evaluarVentana, formatResetTime, type EstadoVentana } from '@/modules/usage-window/estadoVentana';

/**
 * Las ventanas de 5 horas y semanal, como un anillo en el header.
 *
 * Existe porque la API solo avisa el límite una vez que ya rechazó un pedido,
 * así que sin esto la primera señal de problema es el trabajo frenando. Todo
 * el comportamiento vive en este módulo; `WorkspaceHeader` solo lo monta, que
 * es lo que mantiene a un diff de una línea el archivo de arriba.
 *
 * El valor que muestra es el porcentaje real que reporta el SDK — no hay una
 * estimación local de respaldo. Pero una lectura vieja NO se trata como "sin
 * dato": se sigue mostrando, con su antigüedad (`evaluarVentana`). "Sin dato"
 * es únicamente el estado de no tener ninguna lectura; y cuando la ventana ya
 * pasó su hora de reset se muestra "ventana nueva" en vez de un porcentaje
 * que ya no describe la ventana actual.
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
          'flex flex-shrink-0 items-center gap-1 rounded-full outline-none',
          'hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center">
          {estadoCincoHoras.tipo === 'dato' ? (
            <CircleProgress
              value={estadoCincoHoras.porcentaje}
              maxValue={100}
              size={22}
              strokeWidth={2.5}
              // Una lectura vieja sigue siendo un dato real: se ve, pero sin
              // la animación de entrada y en el color apagado de "esto ya no
              // es lo último que sabemos", no en los colores de severidad.
              disableAnimation={!estadoCincoHoras.fresca}
              getColor={estadoCincoHoras.fresca ? undefined : () => 'stroke-muted-foreground/50'}
            />
          ) : (
            // Sin dato, o ventana ya reseteada: anillo neutro. Mostrar un
            // número acá sería afirmar algo sobre la cuenta que no se puede
            // sostener (el "no un porcentaje inventado" del plan).
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
        {estadoCincoHoras.tipo === 'dato' && (
          <span
            className={cn(
              'hidden tabular-nums text-muted-foreground sm:inline',
              !estadoCincoHoras.fresca && 'opacity-60',
            )}
            style={{ fontSize: 'var(--skin-text-xs)' }}
          >
            {Math.round(estadoCincoHoras.porcentaje)}%
          </span>
        )}
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
