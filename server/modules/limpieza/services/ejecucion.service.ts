import { execFile } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { projectsDb, sessionsDb } from '@/modules/database/index.js';
import { broadcastSidebarArchived } from '@/modules/websocket/index.js';

import type { MotivoExento, PlanLimpieza } from './seleccion.service.js';
import { NOMBRES_TMUX_PROTEGIDOS } from './seleccion.service.js';

export type ModoLimpieza = 'simular' | 'ejecutar';

export const TIMEOUT_DORMIR_MS = 20_000;

export type BloqueoLimpieza = {
  /** `project_path` del proyecto que no se archivó. */
  proyecto: string;
  /** Nombre de la sesión de tmux que lo frenó. */
  sesion: string;
  motivo: string;
};

export type LineaLimpieza = {
  ts: string;
  modo: ModoLimpieza;
  archivados: {
    proyectos: Array<{ projectId: string; projectPath: string }>;
    sesiones: Array<{ sessionId: string; motivo: string; proyecto: string | null }>;
  };
  dormidas: string[];
  bloqueados: BloqueoLimpieza[];
  exentos: Array<{ proyecto: string; motivo: MotivoExento }>;
  /** Conteos de lo anterior, para leer la línea de un vistazo. */
  resumen: { proyectos: number; sesiones: number; dormidas: number; bloqueados: number; exentos: number };
  /** Solo si la corrida no pudo evaluar nada (registro ilegible, error inesperado). */
  error?: string;
};

export type ResultadoDormir = { ok: boolean; motivo?: string };

export type DependenciasLimpieza = {
  /** Apaga una sesión de tmux con `orquestar.py dormir`, sin `--forzar`. */
  dormir: (nombre: string) => Promise<ResultadoDormir>;
  archivarProyecto: (projectId: string) => void;
  archivarSesion: (sessionId: string) => void;
  anunciar: (ids: { projectIds: string[]; sessionIds: string[] }) => void;
  escribirLog: (linea: LineaLimpieza) => Promise<void>;
  ahora: () => number;
};

export function modoDesdeEntorno(): ModoLimpieza {
  // Cualquier valor raro cae en `simular`: equivocarse hacia el lado que no toca nada.
  return process.env.LIMPIEZA_MODO === 'ejecutar' ? 'ejecutar' : 'simular';
}

export function rutaLogLimpieza(): string {
  return process.env.LIMPIEZA_LOG_PATH || path.join(os.homedir(), '.cache', 'aos', 'limpieza.jsonl');
}

export function rutaOrquestar(): string {
  return path.join(os.homedir(), 'workspace-leandro', '.claude', 'bin', 'orquestar.py');
}

function dormirConOrquestar(nombre: string): Promise<ResultadoDormir> {
  return new Promise((resolve) => {
    // Sin `--forzar` a propósito: los invariantes de orquestar.py (repo sucio,
    // pregunta pendiente, sesión propia) son lo que protege el trabajo vivo.
    execFile(
      'python3',
      [rutaOrquestar(), 'dormir', nombre],
      { timeout: TIMEOUT_DORMIR_MS },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true });
          return;
        }
        // Un `dormir` colgado lo corta el timeout y cuenta como rechazo.
        const cortado = (error as NodeJS.ErrnoException & { killed?: boolean }).killed === true;
        const detalle = String(stdout || stderr || error.message).trim().split('\n')[0];
        resolve({ ok: false, motivo: cortado ? `timeout de ${TIMEOUT_DORMIR_MS / 1000} s` : detalle });
      },
    );
  });
}

async function escribirLogEnDisco(linea: LineaLimpieza): Promise<void> {
  const ruta = rutaLogLimpieza();
  await mkdir(path.dirname(ruta), { recursive: true });
  await appendFile(ruta, `${JSON.stringify(linea)}\n`, 'utf8');
}

export function dependenciasPorDefecto(): DependenciasLimpieza {
  return {
    dormir: dormirConOrquestar,
    archivarProyecto: (projectId) => projectsDb.updateProjectIsArchivedById(projectId, true, 'auto'),
    archivarSesion: (sessionId) => sessionsDb.updateSessionIsArchived(sessionId, true, 'auto'),
    anunciar: (ids) => {
      broadcastSidebarArchived(ids);
    },
    escribirLog: escribirLogEnDisco,
    ahora: () => Date.now(),
  };
}

/**
 * Ejecuta un plan de `seleccionarLimpieza`.
 *
 * En `simular` no toca nada: ni la DB, ni tmux, ni las pestañas abiertas;
 * solo escribe la línea del log con lo que habría hecho. Como `orquestar.py`
 * no tiene un modo en seco, ahí solo se puede anticipar el bloqueo por los
 * nombres que se protegen de antemano; que un `dormir` concreto lo rechace
 * (repo sucio, pregunta pendiente) solo se sabe al ejecutar.
 *
 * En `ejecutar`, por proyecto candidato se duerme cada sesión de tmux que cae
 * dentro de él; si una se niega, el proyecto no se archiva (ocultar una sesión
 * viva es peor que dejar un proyecto de más). Si todas duermen, se archiva el
 * proyecto con `archived_by='auto'`. El proyecto se lleva sus sesiones como en
 * el archivado manual, así que restaurarlo no las deja ocultas. Al final sale
 * un único `sidebar_archived` con todo lo archivado.
 */
export async function ejecutarLimpieza(
  plan: PlanLimpieza,
  modo: ModoLimpieza = 'simular',
  dependencias: Partial<DependenciasLimpieza> = {},
): Promise<LineaLimpieza> {
  const deps = { ...dependenciasPorDefecto(), ...dependencias };
  const ejecutar = modo === 'ejecutar';

  const linea: LineaLimpieza = {
    ts: new Date(deps.ahora()).toISOString(),
    modo,
    archivados: { proyectos: [], sesiones: [] },
    dormidas: [],
    bloqueados: [],
    exentos: plan.exentos.map((e) => ({ proyecto: e.projectPath, motivo: e.motivo })),
    resumen: { proyectos: 0, sesiones: 0, dormidas: 0, bloqueados: 0, exentos: plan.exentos.length },
  };

  const sesionesArchivadas = new Set<string>();
  const archivarSesionSuelta = (sessionId: string, motivo: string, proyecto: string | null): void => {
    if (sesionesArchivadas.has(sessionId)) return;
    sesionesArchivadas.add(sessionId);
    if (ejecutar) deps.archivarSesion(sessionId);
    linea.archivados.sesiones.push({ sessionId, motivo, proyecto });
  };

  for (const proyecto of plan.proyectos) {
    let bloqueado = false;

    for (const tmux of proyecto.tmux) {
      // Defensa en profundidad: orquestar.py ya los protege, pero a estos dos
      // nombres no se les pasa nunca el comando.
      if (tmux.protegida || NOMBRES_TMUX_PROTEGIDOS.has(tmux.nombre)) {
        linea.bloqueados.push({ proyecto: proyecto.projectPath, sesion: tmux.nombre, motivo: 'sesión protegida (web, orquestador o la fija)' });
        bloqueado = true;
        break;
      }
      if (!ejecutar) {
        linea.dormidas.push(tmux.nombre);
        continue;
      }
      let resultado: ResultadoDormir;
      try {
        resultado = await deps.dormir(tmux.nombre);
      } catch (error) {
        resultado = { ok: false, motivo: error instanceof Error ? error.message : String(error) };
      }
      if (!resultado.ok) {
        linea.bloqueados.push({ proyecto: proyecto.projectPath, sesion: tmux.nombre, motivo: resultado.motivo || 'dormir devolvió un código distinto de 0' });
        bloqueado = true;
        break;
      }
      linea.dormidas.push(tmux.nombre);
    }

    if (bloqueado) {
      // El proyecto se queda, pero las headless terminadas se archivan igual:
      // su sesión no tiene por qué esperar al proyecto.
      for (const sessionId of proyecto.sesionesHeadless) archivarSesionSuelta(sessionId, 'headless-terminada', proyecto.projectPath);
      continue;
    }

    try {
      if (ejecutar) deps.archivarProyecto(proyecto.projectId);
      linea.archivados.proyectos.push({ projectId: proyecto.projectId, projectPath: proyecto.projectPath });
    } catch (error) {
      linea.bloqueados.push({ proyecto: proyecto.projectPath, sesion: '', motivo: `error al archivar: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  for (const sesion of plan.sesiones) archivarSesionSuelta(sesion.sessionId, sesion.motivo, sesion.projectPath);

  linea.resumen.proyectos = linea.archivados.proyectos.length;
  linea.resumen.sesiones = linea.archivados.sesiones.length;
  linea.resumen.dormidas = linea.dormidas.length;
  linea.resumen.bloqueados = linea.bloqueados.length;

  if (ejecutar) {
    deps.anunciar({
      projectIds: linea.archivados.proyectos.map((p) => p.projectId),
      sessionIds: linea.archivados.sesiones.map((s) => s.sessionId),
    });
  }

  await deps.escribirLog(linea);
  return linea;
}
