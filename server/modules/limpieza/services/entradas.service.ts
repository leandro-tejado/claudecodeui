import { readFileSync, statSync } from 'node:fs';

import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { rutaRegistroSesionesTmux } from '@/modules/providers/index.js';

import type { ProyectoLimpieza, SesionFija, SesionLimpieza, TmuxViva } from './seleccion.service.js';

export type EntradasLimpieza = {
  proyectos: ProyectoLimpieza[];
  sesiones: SesionLimpieza[];
  tmuxVivas: TmuxViva[];
  fija: SesionFija | null;
};

type EntradaRegistro = {
  nombre?: unknown;
  session_id?: unknown;
  cwd?: unknown;
  estado?: unknown;
  fija?: unknown;
};

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor : null);

/**
 * Lee el registro de sesiones de tmux (solo lectura). Ausente es "no hay
 * sesiones"; ilegible o a medio escribir lanza: sin saber qué tmux hay vivo no
 * se puede asegurar que archivar no oculte una sesión viva.
 */
export function leerRegistroTmux(): { tmuxVivas: TmuxViva[]; fija: SesionFija | null } {
  let crudo: string;
  try {
    crudo = readFileSync(rutaRegistroSesionesTmux(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { tmuxVivas: [], fija: null };
    throw error;
  }

  const datos = JSON.parse(crudo) as unknown;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new Error('el registro de sesiones no es un objeto');
  }

  const tmuxVivas: TmuxViva[] = [];
  let fija: SesionFija | null = null;
  for (const [clave, valor] of Object.entries(datos as Record<string, EntradaRegistro>)) {
    if (!valor || typeof valor !== 'object') continue;
    const nombre = texto(valor.nombre) ?? clave;
    if (valor.fija === true) fija = { sessionId: texto(valor.session_id), cwd: texto(valor.cwd) };
    if (valor.estado === 'viva') tmuxVivas.push({ nombre, sessionId: texto(valor.session_id), cwd: texto(valor.cwd) });
  }
  return { tmuxVivas, fija };
}

function mtimeDe(ruta: string | null): number | null {
  if (!ruta) return null;
  try {
    return statSync(ruta).mtimeMs;
  } catch {
    return null;
  }
}

/** Arma lo que `seleccionarLimpieza` necesita desde la DB y el registro. */
export function leerEntradasLimpieza(ahora: number): EntradasLimpieza {
  const proyectos: ProyectoLimpieza[] = [
    ...projectsDb.getProjectPaths().map((p) => ({ projectId: p.project_id, projectPath: p.project_path, isStarred: p.isStarred === 1, archivado: false })),
    ...projectsDb.getArchivedProjectPaths().map((p) => ({ projectId: p.project_id, projectPath: p.project_path, isStarred: p.isStarred === 1, archivado: true })),
  ];

  const sesiones: SesionLimpieza[] = sessionsDb.getAllSessions().map((s) => {
    const actualizada = Date.parse(s.updated_at);
    return {
      sessionId: s.session_id,
      providerSessionId: s.provider_session_id,
      projectPath: s.project_path,
      entrypoint: s.entrypoint ?? null,
      // Una fecha ilegible cuenta como "ahora": no se archiva por falta de dato.
      updatedAtMs: Number.isNaN(actualizada) ? ahora : actualizada,
      // Solo las headless necesitan el mtime de su transcript.
      jsonlMtimeMs: s.entrypoint === 'sdk-cli' ? mtimeDe(s.jsonl_path) : null,
    };
  });

  return { proyectos, sesiones, ...leerRegistroTmux() };
}
