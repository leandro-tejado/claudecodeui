import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/utils';
import { useUsageDetalle } from '@/modules/usage-window/useUsageDetalle';
import { useUsageWindow } from '@/modules/usage-window/useUsageWindow';
import type { GobernadorEstado, UsageDetalle, UsageWindowSnapshot } from '@/modules/usage-window/types';
import { evaluarVentana, formatResetTime, type EstadoVentana } from '@/modules/usage-window/estadoVentana';

/*
 * El medidor completo (escena 9 del boceto 09-oct): todo lo que se mide vive
 * acá adentro y la cabecera se queda con un solo anillo. Una sección por
 * cuenta —la activa primero—, después lo que mande quien lo monta (`extra`:
 * contexto de la sesión y servidor, que son del skin) y al final el gobernador
 * y lo que está contribuyendo al consumo.
 */

const COLOR_SEMAFORO: Record<GobernadorEstado['color'], string> = {
  verde: 'text-emerald-500',
  ambar: 'text-amber-500',
  rojo: 'text-red-500',
};

function nombreSesion(cwd: string): string {
  const partes = cwd.split('/').filter(Boolean);
  return partes[partes.length - 1] ?? cwd;
}

function nombreCuenta(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

/** "06:00" si es hoy, "lun 06:00" si es otro día: la semanal resetea días después. */
export function cuandoResetea(resetsAt: number, now: number): string {
  const hora = formatResetTime(resetsAt);
  const mismoDia = new Date(resetsAt).toDateString() === new Date(now).toDateString();
  if (mismoDia) return hora;
  const dia = new Date(resetsAt).toLocaleDateString('es', { weekday: 'short' }).replace('.', '');
  return `${dia} ${hora}`;
}

/** La línea chica de una ventana: antigüedad del dato y cuándo se renueva. */
function detalle(estado: EstadoVentana, now: number): string {
  if (estado.tipo === 'sin-dato') return 'sin leer aún';
  if (estado.tipo === 'ventana-nueva') return `se renovó a las ${formatResetTime(estado.resetsAt)}`;
  const antiguedad = estado.fresca ? 'dato real' : `hace ${estado.minutosAntiguedad} min`;
  if (estado.resetsAt === null) return antiguedad;
  return `${antiguedad} · resetea ${cuandoResetea(estado.resetsAt, now)}`;
}

function colorBarra(pct: number): string {
  if (pct >= 90) return 'bg-ds-signal-bad';
  if (pct >= 60) return 'bg-ds-signal-warn';
  return 'bg-ds-signal-good';
}

/** Una fila del medidor: rótulo, barra y valor. La exportan también las secciones del skin. */
export function FilaMedidor({
  rotulo,
  pct,
  valor,
  nota,
}: {
  rotulo: string;
  pct: number | null;
  valor: string;
  nota?: string;
}) {
  const ancho = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="py-0.5">
      <div className="grid grid-cols-[72px_1fr_64px] items-center gap-2.5 text-xs text-muted-foreground">
        <span>{rotulo}</span>
        <span className="h-[5px] overflow-hidden rounded-full bg-ds-surface-3" aria-hidden="true">
          {pct !== null && <span className={cn('block h-full rounded-full', colorBarra(ancho))} style={{ width: `${ancho}%` }} />}
        </span>
        <b className="whitespace-nowrap text-right font-semibold tabular-nums text-foreground">{valor}</b>
      </div>
      {nota && <p className="ml-[82px] text-[11px] leading-tight text-ds-faint">{nota}</p>}
    </div>
  );
}

export function TituloMedidor({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground first:mt-0">
      {children}
    </h4>
  );
}

function valorVentana(estado: EstadoVentana): { pct: number | null; valor: string } {
  if (estado.tipo === 'dato') return { pct: estado.porcentaje, valor: `${Math.round(estado.porcentaje)} %` };
  if (estado.tipo === 'ventana-nueva') return { pct: 0, valor: 'nueva' };
  return { pct: null, valor: '—' };
}

function SeccionCuenta({ titulo, snapshot, now }: { titulo: string; snapshot: UsageWindowSnapshot | null; now: number }) {
  const cinco = evaluarVentana(snapshot?.fiveHour ?? null, now);
  const semanal = evaluarVentana(snapshot?.sevenDay ?? null, now);
  const v5 = valorVentana(cinco);
  const v7 = valorVentana(semanal);
  return (
    <section>
      <TituloMedidor>{titulo}</TituloMedidor>
      <FilaMedidor rotulo="5 horas" pct={v5.pct} valor={v5.valor} nota={detalle(cinco, now)} />
      <FilaMedidor rotulo="Semanal" pct={v7.pct} valor={v7.valor} nota={detalle(semanal, now)} />
    </section>
  );
}

/** Otra cuenta: lee su propia ventana, así cada sección habla de la suya. */
function SeccionOtraCuenta({ cuenta, now }: { cuenta: string; now: number }) {
  const snapshot = useUsageWindow(cuenta);
  return <SeccionCuenta titulo={`Cuenta ${nombreCuenta(cuenta)}`} snapshot={snapshot} now={now} />;
}

type Props = {
  snapshot: UsageWindowSnapshot | null;
  /** Cuenta de IA a la que pertenece esta cuota; sin ella, la de siempre (optimum). */
  cuenta?: string;
  /** Todas las cuentas: las que no son `cuenta` se muestran debajo, con su propia lectura. */
  cuentas?: string[];
  /** Reloj del indicador: así el popover no necesita su propio timer para revisar frescura. */
  now: number;
  onClose: () => void;
  /** Rect del botón que lo abre, para anclarlo desde el portal. */
  anchor: DOMRect | null;
  /** El botón mismo, para no cerrar y reabrir en el mismo gesto. */
  anchorEl: HTMLElement | null;
  /** Secciones que no son de cuota: contexto de la sesión, servidor. */
  extra?: ReactNode;
};

export default function UsageWindowPopover({ snapshot, cuenta, cuentas, now, onClose, anchor, anchorEl, extra }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { detalle: consumo, gobernador } = useUsageDetalle(true, cuenta);

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
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose, anchorEl]);

  const activa = cuenta ?? 'optimum';
  const otras = (cuentas ?? []).filter((id) => id !== activa);

  /*
   * Va en un portal, no como hijo del botón: la cabecera es translúcida
   * (`backdrop-filter`) y eso abre un stacking context propio, donde el panel
   * quedaba entreverado con el chat. Se ancla a mano contra el rect del botón,
   * con `right` para no salirse por el borde en pantallas angostas.
   */
  const width = Math.min(340, window.innerWidth - 24);
  const top = (anchor?.bottom ?? 0) + 8;
  const right = Math.max(12, window.innerWidth - (anchor?.right ?? window.innerWidth));

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Medidor de cuota y recursos"
      data-testid="medidor"
      style={{ position: 'fixed', top, right, width }}
      className="ds-material-chrome z-[100] max-h-[75vh] overflow-y-auto rounded-ds-lg border border-border px-4 py-3.5 text-popover-foreground shadow-ds-float"
    >
      <SeccionCuenta titulo={`Cuenta ${nombreCuenta(activa)}`} snapshot={snapshot} now={now} />
      {otras.map((id) => (
        <SeccionOtraCuenta key={id} cuenta={id} now={now} />
      ))}

      {extra}

      {gobernador && (
        <section>
          <TituloMedidor>Ritmo</TituloMedidor>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{gobernador.motivo}</span>
            <span className={cn('font-semibold', COLOR_SEMAFORO[gobernador.color])}>
              {gobernador.color}
              {gobernador.pace !== null ? ` · ${Math.round(gobernador.pace)}%` : ''}
            </span>
          </div>
        </section>
      )}

      <Contribuyendo detalle={consumo} />
    </div>,
    document.body,
  );
}

/** El bloque "qué está contribuyendo": top de sesiones, subagentes, contexto alto y skills. */
function Contribuyendo({ detalle }: { detalle: UsageDetalle | null }) {
  if (!detalle) return null;

  return (
    <section>
      <TituloMedidor>
        <span className="flex items-baseline justify-between gap-2">
          <span>Qué está contribuyendo</span>
          <span className="tabular-nums text-foreground">${detalle.usdTotal.toFixed(2)}</span>
        </span>
      </TituloMedidor>

      {detalle.topSesiones.length > 0 && (
        <ul className="space-y-0.5">
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
    </section>
  );
}
