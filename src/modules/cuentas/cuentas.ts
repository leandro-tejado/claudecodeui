import { Briefcase, User } from 'lucide-react';
import { createElement, type ReactElement } from 'react';

/**
 * Cuentas de IA (plans/06-octubre-vps-multi-cuenta.md, Fase 3).
 *
 * Espejo de `CuentaPublica` en server/modules/cuentas: lo único que el
 * servidor manda al navegador. Nunca trae el token ni la ruta de la
 * credencial, y este módulo tampoco los pide.
 */
export type CuentaPublica = {
  id: string;
  plan: string | null;
  defecto: boolean;
  uso: string | null;
  /** La credencial existe en el VPS. Una cuenta sin ella se ve pero no se puede elegir. */
  disponible: boolean;
};

/** La cuenta con la que corre todo lo que no pidió otra: la del proceso del servidor. */
export const CUENTA_POR_DEFECTO = 'optimum';

/** Id de la cuenta de una sesión: un campo ausente es optimum, nunca "desconocida". */
export function cuentaDeSesion(session: { cuenta?: unknown } | null | undefined): string {
  const valor = session?.cuenta;
  return typeof valor === 'string' && valor.trim() ? valor.trim() : CUENTA_POR_DEFECTO;
}

/** Ícono de la cuenta: maletín = trabajo del cliente, persona = proyectos propios. Cualquier otra, persona. */
export function iconoDeCuenta(id: string, className?: string): ReactElement {
  return createElement(id === 'optimum' ? Briefcase : User, { className, 'aria-hidden': true });
}

/** Inicial en mayúscula: O de optimum, P de personal. */
export function inicialDeCuenta(id: string): string {
  return (id.trim().charAt(0) || '?').toUpperCase();
}

/** "Optimum", "Personal": el id con la primera en mayúscula, que es como se habla de ellas. */
export function nombreDeCuenta(id: string): string {
  const limpio = id.trim();
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : '';
}

export type NivelCuota = 'ok' | 'aviso' | 'tope';

/** Menos de 60% normal, de 60 a 85 ámbar, más de 85 rojo: los cortes del boceto. */
export function nivelDeCuota(porcentaje: number | null | undefined): NivelCuota {
  if (typeof porcentaje !== 'number' || !Number.isFinite(porcentaje)) return 'ok';
  if (porcentaje > 85) return 'tope';
  if (porcentaje >= 60) return 'aviso';
  return 'ok';
}

/** Desde acá una ventana ya no deja trabajar: el gobernador del servidor corta en 98. */
export const UMBRAL_TOPE = 98;

export type VentanaEnTope = { ventana: '5h' | '7d'; resetsAt: number | null };

type LecturaMinima = { porcentaje: number; resetsAt: number | null } | null | undefined;

/** En tope y todavía vigente: una lectura cuyo reset ya pasó es de una ventana ya cerrada. */
function topada(lectura: LecturaMinima, now: number): boolean {
  if (!lectura) return false;
  if (lectura.resetsAt !== null && now >= lectura.resetsAt) return false;
  return lectura.porcentaje >= UMBRAL_TOPE;
}

/**
 * La ventana que dejó a la cuenta en tope, o `null` si no hay ninguna. Si las
 * dos están topadas gana la semanal, que es la que tarda más en volver.
 */
export function ventanaEnTope(
  snapshot: { fiveHour?: LecturaMinima; sevenDay?: LecturaMinima } | null | undefined,
  now: number,
): VentanaEnTope | null {
  if (topada(snapshot?.sevenDay, now)) return { ventana: '7d', resetsAt: snapshot?.sevenDay?.resetsAt ?? null };
  if (topada(snapshot?.fiveHour, now)) return { ventana: '5h', resetsAt: snapshot?.fiveHour?.resetsAt ?? null };
  return null;
}
