import { useSyncExternalStore } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { CUENTA_POR_DEFECTO, type CuentaPublica } from '@/modules/cuentas/cuentas';

/*
 * Las cuentas disponibles y la que se va a usar en la PRÓXIMA sesión nueva.
 *
 * El selector vive en el composer, el botón "abrir con la otra cuenta" en el
 * header, y quien crea la sesión es un hook del chat: tres ramas del árbol que
 * no comparten ancestro cómodo. Mismo store externo mínimo que
 * `contextMeterStore`, para no subir estado por componentes de upstream.
 *
 * `nuevaCuenta` vuelve a optimum cada vez que una sesión se crea: la cuenta se
 * fija al crearla y la siguiente sesión arranca otra vez en el defecto, como en
 * el boceto ("Optimum viene marcada"). Nunca hay cambio automático de cuenta.
 */

type CuentasState = {
  cuentas: CuentaPublica[];
  cargadas: boolean;
  nuevaCuenta: string;
};

let state: CuentasState = { cuentas: [], cargadas: false, nuevaCuenta: CUENTA_POR_DEFECTO };
let cargando = false;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

function esCuentaPublica(valor: unknown): valor is CuentaPublica {
  return typeof valor === 'object' && valor !== null && typeof (valor as { id?: unknown }).id === 'string';
}

/** Pide la lista una vez; los reintentos son del llamador (no hay polling: el registro casi no cambia). */
export async function cargarCuentas(force = false): Promise<void> {
  if (cargando || (state.cargadas && !force)) return;
  cargando = true;
  try {
    const response = await authenticatedFetch('/api/cuentas');
    if (!response.ok) return;
    const body = (await response.json()) as { cuentas?: unknown };
    const cuentas = Array.isArray(body.cuentas) ? body.cuentas.filter(esCuentaPublica) : [];
    state = { ...state, cuentas, cargadas: true };
    emit();
  } catch {
    // Sin la lista, el selector muestra solo la cuenta por defecto: el chat sigue andando.
  } finally {
    cargando = false;
  }
}

/** Elige la cuenta de la próxima sesión nueva. */
export function elegirCuentaNueva(id: string): void {
  const limpio = id.trim() || CUENTA_POR_DEFECTO;
  if (state.nuevaCuenta === limpio) return;
  state = { ...state, nuevaCuenta: limpio };
  emit();
}

/** La cuenta para el `POST /sessions`. No la reinicia: eso pasa recién cuando la sesión quedó creada. */
export function cuentaDeLaSesionNueva(): string {
  return state.nuevaCuenta;
}

/** La sesión quedó creada: la siguiente vuelve a arrancar en la cuenta por defecto. */
export function reiniciarCuentaNueva(): void {
  elegirCuentaNueva(CUENTA_POR_DEFECTO);
}

export const useCuentasState = (): CuentasState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Solo para tests. */
export function _reiniciarCuentasStoreParaTests(): void {
  state = { cuentas: [], cargadas: false, nuevaCuenta: CUENTA_POR_DEFECTO };
  cargando = false;
  emit();
}
