import { dependenciasPorDefecto, ejecutarLimpieza, modoDesdeEntorno } from './ejecucion.service.js';
import type { DependenciasLimpieza, LineaLimpieza, ModoLimpieza } from './ejecucion.service.js';
import { leerEntradasLimpieza } from './entradas.service.js';
import type { EntradasLimpieza } from './entradas.service.js';
import { seleccionarLimpieza } from './seleccion.service.js';

export type OpcionesCorrida = {
  modo?: ModoLimpieza;
  leerEntradas?: (ahora: number) => EntradasLimpieza;
  dependencias?: Partial<DependenciasLimpieza>;
};

// Nunca dos corridas a la vez: un `dormir` puede tardar hasta su timeout y el
// intervalo de la hora no espera a nadie.
let corriendo = false;

/** `null` si ya había otra corrida en curso. */
export async function correrLimpieza(opciones: OpcionesCorrida = {}): Promise<LineaLimpieza | null> {
  if (corriendo) return null;
  corriendo = true;
  const modo = opciones.modo ?? modoDesdeEntorno();
  const deps = { ...dependenciasPorDefecto(), ...opciones.dependencias };
  try {
    const ahora = deps.ahora();
    const entradas = (opciones.leerEntradas ?? leerEntradasLimpieza)(ahora);
    const plan = seleccionarLimpieza(ahora, entradas.proyectos, entradas.sesiones, entradas.tmuxVivas, entradas.fija);
    return await ejecutarLimpieza(plan, modo, deps);
  } catch (error) {
    // Una corrida que no pudo ni evaluar deja constancia y no toca nada.
    const linea: LineaLimpieza = {
      ts: new Date(deps.ahora()).toISOString(),
      modo,
      archivados: { proyectos: [], sesiones: [] },
      dormidas: [],
      bloqueados: [],
      exentos: [],
      resumen: { proyectos: 0, sesiones: 0, dormidas: 0, bloqueados: 0, exentos: 0 },
      error: error instanceof Error ? error.message : String(error),
    };
    try {
      await deps.escribirLog(linea);
    } catch {
      // Sin log tampoco hay a dónde avisar.
    }
    return linea;
  } finally {
    corriendo = false;
  }
}
