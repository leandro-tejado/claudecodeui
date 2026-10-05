import path from 'node:path';

/**
 * Selección pura de la limpieza de la barra (Fase 5 de
 * `05-octubre-limpieza-barra-viva.md`).
 *
 * Recibe hechos ya resueltos y devuelve un plan; no toca la DB, ni tmux, ni el
 * disco, ni el reloj. Es el mismo patrón que `motivo_invariante` en
 * `orquestar.py`: la decisión se testea sin nada de verdad y la ejecución es
 * fina.
 */

export const HORAS_INACTIVIDAD = 72;
/** Tope de proyectos visibles, sin contar los fijados ni el de la sesión fija. */
export const TOPE_PROYECTOS = 3;
export const MINUTOS_HEADLESS_TERMINADA = 10;

const HORA_MS = 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

/**
 * El proyecto descartable de la suite E2E (`e2e/lib/config.mjs`). Comparte
 * `~/.claude` con esta instancia, así que sus turnos se ven como actividad: sin
 * esto le quitaba un lugar del tope a un proyecto real (pasó el 05-oct).
 */
export function esProyectoDePrueba(projectPath: string): boolean {
  const partes = projectPath.split(/[\\/]+/);
  const i = partes.indexOf('cloudcli-e2e');
  return i > 0 && partes[i - 1] === '.cache';
}

/** Nombres que `orquestar.py` protege; la limpieza no se los pasa nunca. */
export const NOMBRES_TMUX_PROTEGIDOS: ReadonlySet<string> = new Set(['web', 'orquestador']);

export type ProyectoLimpieza = {
  projectId: string;
  projectPath: string;
  isStarred: boolean;
  /**
   * Un proyecto archivado no se evalúa, pero sigue contando para asignar el
   * cwd de una sesión de tmux: si vive dentro de uno archivado no debe caerle
   * al proyecto padre.
   */
  archivado: boolean;
};

export type SesionLimpieza = {
  sessionId: string;
  providerSessionId?: string | null;
  projectPath: string | null;
  /** `'cli'`, `'sdk-ts'`, `'sdk-cli'` o `null` (aún sin leer: cuenta como interactiva). */
  entrypoint: string | null;
  /** Último movimiento de la sesión, en ms desde epoch. */
  updatedAtMs: number;
  /** Última escritura de su `.jsonl`; `null` si no hay archivo (se usa `updatedAtMs`). */
  jsonlMtimeMs: number | null;
};

/** Una sesión de tmux `estado: viva` del registro. */
export type TmuxViva = {
  nombre: string;
  sessionId: string | null;
  cwd: string | null;
};

/** La entrada `fija: true` del registro (la Session Orquestadora), esté viva o no. */
export type SesionFija = {
  sessionId: string | null;
  cwd: string | null;
};

export type MotivoExento = 'fijado' | 'sesion-fija' | 'tope';

export type TmuxAsignada = {
  nombre: string;
  /** `web`, `orquestador` o la fija: no se le pasa a `orquestar.py` y bloquea el archivado. */
  protegida: boolean;
};

export type ProyectoCandidato = {
  projectId: string;
  projectPath: string;
  /** `null` si el proyecto no tiene ninguna sesión interactiva. */
  ultimaActividad: number | null;
  tmux: TmuxAsignada[];
  sesiones: string[];
  /** Subconjunto de `sesiones`: headless ya terminadas, que se archivan aunque el proyecto no. */
  sesionesHeadless: string[];
};

export type SesionSeleccionada = {
  sessionId: string;
  projectPath: string | null;
  motivo: 'inactiva' | 'headless-terminada';
};

export type PlanLimpieza = {
  ahora: number;
  /** Proyectos que se quedan a la vista: fijados, el de la sesión fija y los del tope. */
  exentos: Array<{ projectId: string; projectPath: string; motivo: MotivoExento }>;
  proyectos: ProyectoCandidato[];
  /** Sesiones a archivar de proyectos que se quedan (o sin proyecto). */
  sesiones: SesionSeleccionada[];
};

function sinSeparadorFinal(ruta: string): string {
  return ruta.length > 1 ? ruta.replace(/[\\/]+$/, '') : ruta;
}

/**
 * Prefijo con separador de directorio, no de string crudo: `/a/app` es
 * prefijo de `/a/app/src` pero no de `/a/app-viejo`.
 */
export function rutaDentroDe(cwd: string, raiz: string): boolean {
  const c = sinSeparadorFinal(cwd);
  const r = sinSeparadorFinal(raiz);
  if (c === r) return true;
  return c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/**
 * Proyecto con el `project_path` más largo que sea prefijo del cwd. `null` si
 * ninguno lo es: una sesión fuera de todo proyecto no se toca.
 */
export function proyectoDeCwd<T extends { projectPath: string }>(cwd: string | null, proyectos: T[]): T | null {
  if (!cwd) return null;
  let mejor: T | null = null;
  for (const proyecto of proyectos) {
    if (!rutaDentroDe(cwd, proyecto.projectPath)) continue;
    if (!mejor || proyecto.projectPath.length > mejor.projectPath.length) mejor = proyecto;
  }
  return mejor;
}

function esInteractiva(sesion: SesionLimpieza): boolean {
  // NULL cuenta como interactiva: no se archiva por falta de dato.
  return sesion.entrypoint !== 'sdk-cli';
}

export function seleccionarLimpieza(
  ahora: number,
  proyectos: ProyectoLimpieza[],
  sesiones: SesionLimpieza[],
  tmuxVivas: TmuxViva[],
  fija: SesionFija | null = null,
): PlanLimpieza {
  const limiteInactividad = ahora - HORAS_INACTIVIDAD * HORA_MS;
  const limiteHeadless = ahora - MINUTOS_HEADLESS_TERMINADA * MINUTO_MS;

  const activos = proyectos.filter((p) => !p.archivado);

  // Actividad = máximo `updated_at` de las sesiones interactivas del proyecto.
  const ultimaActividad = new Map<string, number>();
  const sesionesPorProyecto = new Map<string, SesionLimpieza[]>();
  for (const sesion of sesiones) {
    if (!sesion.projectPath) continue;
    const lista = sesionesPorProyecto.get(sesion.projectPath) ?? [];
    lista.push(sesion);
    sesionesPorProyecto.set(sesion.projectPath, lista);
    if (!esInteractiva(sesion)) continue;
    const previa = ultimaActividad.get(sesion.projectPath);
    if (previa === undefined || sesion.updatedAtMs > previa) ultimaActividad.set(sesion.projectPath, sesion.updatedAtMs);
  }

  // El proyecto de la sesión fija, por su cwd y por la fila de la propia sesión.
  const proyectoFijaPorCwd = proyectoDeCwd(fija?.cwd ?? null, proyectos);
  const rutasFija = new Set<string>();
  if (proyectoFijaPorCwd) rutasFija.add(proyectoFijaPorCwd.projectPath);
  if (fija?.sessionId) {
    for (const sesion of sesiones) {
      if (sesion.sessionId === fija.sessionId && sesion.projectPath) rutasFija.add(sesion.projectPath);
    }
  }

  // El tope: de lo que no está fijado, los N proyectos con actividad más
  // reciente. Sin actividad interactiva no hay nada que mostrar, así que no
  // compiten; el empate se resuelve por ruta para que el resultado sea estable.
  const eximido = (p: ProyectoLimpieza): 'fijado' | 'sesion-fija' | null =>
    p.isStarred ? 'fijado' : rutasFija.has(p.projectPath) ? 'sesion-fija' : null;
  const ranking = activos
    .filter((p) => !eximido(p) && !esProyectoDePrueba(p.projectPath) && ultimaActividad.has(p.projectPath))
    .sort((a, b) => ultimaActividad.get(b.projectPath)! - ultimaActividad.get(a.projectPath)! || a.projectPath.localeCompare(b.projectPath));
  const enElTope = new Set(ranking.slice(0, TOPE_PROYECTOS).map((p) => p.projectId));

  const sidsConTmux = new Set<string>();
  for (const viva of tmuxVivas) {
    if (viva.sessionId) sidsConTmux.add(viva.sessionId);
  }
  const tieneTmux = (sesion: SesionLimpieza): boolean =>
    sidsConTmux.has(sesion.sessionId) || (sesion.providerSessionId ? sidsConTmux.has(sesion.providerSessionId) : false);
  const esFija = (sesion: SesionLimpieza): boolean =>
    Boolean(fija?.sessionId) && (sesion.sessionId === fija!.sessionId || sesion.providerSessionId === fija!.sessionId);

  const plan: PlanLimpieza = { ahora, exentos: [], proyectos: [], sesiones: [] };
  const candidatos = new Set<string>();

  for (const proyecto of activos) {
    const actividad = ultimaActividad.get(proyecto.projectPath) ?? null;

    const motivoExento: MotivoExento | null = eximido(proyecto) ?? (enElTope.has(proyecto.projectId) ? 'tope' : null);
    if (motivoExento) {
      plan.exentos.push({ projectId: proyecto.projectId, projectPath: proyecto.projectPath, motivo: motivoExento });
      continue;
    }

    candidatos.add(proyecto.projectPath);
    const susSesiones = sesionesPorProyecto.get(proyecto.projectPath) ?? [];
    plan.proyectos.push({
      projectId: proyecto.projectId,
      projectPath: proyecto.projectPath,
      ultimaActividad: actividad,
      tmux: tmuxVivas
        .filter((viva) => proyectoDeCwd(viva.cwd, proyectos)?.projectId === proyecto.projectId)
        .map((viva) => ({
          nombre: viva.nombre,
          protegida: NOMBRES_TMUX_PROTEGIDOS.has(viva.nombre) || (Boolean(fija?.sessionId) && viva.sessionId === fija!.sessionId),
        })),
      sesiones: susSesiones.filter((s) => !esFija(s)).map((s) => s.sessionId),
      sesionesHeadless: susSesiones
        .filter((s) => !esFija(s) && esHeadlessTerminada(s, limiteHeadless, tieneTmux(s)))
        .map((s) => s.sessionId),
    });
  }

  // Sesiones sueltas: en proyectos que se quedan (o sin proyecto).
  for (const sesion of sesiones) {
    if (sesion.projectPath && candidatos.has(sesion.projectPath)) continue;
    if (esFija(sesion)) continue;
    if (esHeadlessTerminada(sesion, limiteHeadless, tieneTmux(sesion))) {
      plan.sesiones.push({ sessionId: sesion.sessionId, projectPath: sesion.projectPath, motivo: 'headless-terminada' });
    } else if (esInteractiva(sesion) && sesion.updatedAtMs <= limiteInactividad && !tieneTmux(sesion)) {
      plan.sesiones.push({ sessionId: sesion.sessionId, projectPath: sesion.projectPath, motivo: 'inactiva' });
    }
  }

  return plan;
}

/** `sdk-cli` cuyo `.jsonl` no se escribe hace 10 min o más y sin tmux vivo. */
function esHeadlessTerminada(sesion: SesionLimpieza, limiteHeadless: number, conTmux: boolean): boolean {
  if (esInteractiva(sesion) || conTmux) return false;
  return (sesion.jsonlMtimeMs ?? sesion.updatedAtMs) <= limiteHeadless;
}
