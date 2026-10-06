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
 * `nuevaCuenta` vuelve a la sugerida cada vez que una sesión se crea: la cuenta
 * se fija al crearla y la siguiente arranca otra vez en la sugerida.
 *
 * La sugerida (Fase 5 del plan multi-cuenta) es la que `rutas` de cuentas.json
 * le da al proyecto abierto — el dueño del trabajo — y la resuelve el servidor
 * con `cuenta para`. Sin proyecto o si el pedido falla, optimum. Nunca depende
 * de la cuota: elegir por cuál tiene cuota libre es el failover que el plan deja
 * fuera. Una elección a mano gana sobre la sugerida hasta cambiar de proyecto.
 */

type CuentasState = {
  cuentas: CuentaPublica[];
  cargadas: boolean;
  nuevaCuenta: string;
  /** La que `rutas` le da al proyecto abierto. */
  sugerida: string;
};

const ESTADO_INICIAL: CuentasState = {
  cuentas: [],
  cargadas: false,
  nuevaCuenta: CUENTA_POR_DEFECTO,
  sugerida: CUENTA_POR_DEFECTO,
};

let state: CuentasState = ESTADO_INICIAL;
let cargando = false;
/** La persona eligió en el menú: la sugerida no la pisa hasta cambiar de proyecto. */
let elegidaAMano = false;
/** Proyecto de la última sugerencia pedida: una respuesta de otro proyecto llega tarde y se descarta. */
let rutaSugerida: string | null = null;
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

function fijarNueva(id: string): void {
  const limpio = id.trim() || CUENTA_POR_DEFECTO;
  if (state.nuevaCuenta === limpio) return;
  state = { ...state, nuevaCuenta: limpio };
  emit();
}

/** Elige a mano la cuenta de la próxima sesión nueva. */
export function elegirCuentaNueva(id: string): void {
  elegidaAMano = true;
  fijarNueva(id);
}

/**
 * Pide la cuenta que le toca al proyecto (`GET /api/cuentas/para`) y la deja
 * como la de la próxima sesión nueva, salvo que se haya elegido a mano en este
 * mismo proyecto. Cambiar de proyecto descarta la elección a mano.
 */
export async function sugerirCuentaParaProyecto(ruta: string | null | undefined): Promise<void> {
  const limpia = typeof ruta === 'string' && ruta.trim() ? ruta.trim() : null;
  if (limpia !== rutaSugerida) {
    rutaSugerida = limpia;
    elegidaAMano = false;
  }
  let sugerida = CUENTA_POR_DEFECTO;
  if (limpia) {
    try {
      const response = await authenticatedFetch(`/api/cuentas/para?ruta=${encodeURIComponent(limpia)}`);
      if (response.ok) {
        const body = (await response.json()) as { cuenta?: unknown };
        if (typeof body.cuenta === 'string' && body.cuenta.trim()) sugerida = body.cuenta.trim();
      }
    } catch {
      // Sin respuesta, la de por defecto: el selector sigue dejando elegir.
    }
  }
  if (rutaSugerida !== limpia) return;
  if (state.sugerida !== sugerida) {
    state = { ...state, sugerida };
    emit();
  }
  if (!elegidaAMano) fijarNueva(sugerida);
}

/** La cuenta para el `POST /sessions`. No la reinicia: eso pasa recién cuando la sesión quedó creada. */
export function cuentaDeLaSesionNueva(): string {
  return state.nuevaCuenta;
}

/** La sesión quedó creada: la siguiente vuelve a arrancar en la sugerida del proyecto. */
export function reiniciarCuentaNueva(): void {
  elegidaAMano = false;
  fijarNueva(state.sugerida);
}

export const useCuentasState = (): CuentasState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Solo para tests. */
export function _reiniciarCuentasStoreParaTests(): void {
  state = ESTADO_INICIAL;
  cargando = false;
  elegidaAMano = false;
  rutaSugerida = null;
  emit();
}
