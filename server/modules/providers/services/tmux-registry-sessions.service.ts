import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { sessionsDb } from '@/modules/database/index.js';

/**
 * Sesiones de Claude vivas en tmux que todavía no tienen transcript.
 *
 * Los synchronizers indexan `.jsonl`, y Claude Code no escribe el suyo hasta
 * el primer mensaje: una sesión creada fuera de CloudCLI (`orquestar.py`,
 * `ct`) y todavía sin prompt no llegaba nunca al sidebar. El registro de tmux
 * (`registro-sesion.sh` en `SessionStart`, ver `.claude/bin/sesiones.py` del
 * workspace) ya conoce su `session_id` y su `cwd`, así que la fila sale de ahí
 * — sin importar qué mecanismo abrió la sesión.
 */

type RegistroEntry = {
  nombre?: unknown;
  session_id?: unknown;
  cwd?: unknown;
  estado?: unknown;
  creada?: unknown;
};

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Env override solo para tests — el mismo que usa `projects-with-sessions-fetch.service.ts`. */
export function rutaRegistroSesionesTmux(): string {
  return process.env.AOS_SESIONES_REGISTRO_PATH || path.join(os.homedir(), '.cache', 'aos', 'sesiones.json');
}

/** `null` si el registro no se puede leer: ausente o a medio escribir no es lo mismo que "no hay sesiones vivas". */
async function leerRegistro(): Promise<Record<string, RegistroEntry> | null> {
  try {
    const data = JSON.parse(await readFile(rutaRegistroSesionesTmux(), 'utf8')) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, RegistroEntry>) : null;
  } catch {
    return null;
  }
}

export type SincronizacionTmuxResult = {
  /** `session_id` de las filas creadas en esta pasada. */
  indexadas: string[];
  podadas: number;
};

export async function sincronizarSesionesTmuxSinTranscript(): Promise<SincronizacionTmuxResult> {
  const registro = await leerRegistro();
  if (!registro) {
    // Sin registro legible no se poda: se leería como "murieron todas".
    return { indexadas: [], podadas: 0 };
  }

  const vivas: string[] = [];
  const indexadas: string[] = [];

  for (const [clave, entry] of Object.entries(registro)) {
    if (entry.estado !== 'viva') continue;
    if (typeof entry.session_id !== 'string' || !SESSION_ID_PATTERN.test(entry.session_id)) continue;
    if (typeof entry.cwd !== 'string' || !path.isAbsolute(entry.cwd)) continue;

    vivas.push(entry.session_id);
    const nombre = typeof entry.nombre === 'string' && entry.nombre ? entry.nombre : clave;
    const creada = typeof entry.creada === 'number' && entry.creada > 0
      ? new Date(entry.creada * 1000).toISOString()
      : undefined;

    try {
      if (sessionsDb.createPendingTmuxSession(entry.session_id, entry.cwd, nombre, creada)) {
        indexadas.push(entry.session_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('No se pudo indexar la sesión tmux sin transcript', { nombre, error: message });
    }
  }

  const podadas = sessionsDb.deletePendingTmuxSessionsExcept(vivas);
  return { indexadas, podadas };
}

// Mismo charset que `nombreTmux()` y que acepta tmux-bridge: un nombre fuera
// de esto no llega nunca a un `tmux -t`.
const NOMBRE_TMUX_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Nombre de la sesión de tmux viva que, según el registro, corre la sesión de
 * Claude `sessionIds` (se prueba cada id: el de la app y el del provider).
 *
 * Es lo que conecta el chat con los panes que CloudCLI no creó —`orquestar.py`,
 * `ct`—, cuyo nombre no es el determinístico de `nombreTmux()`. Síncrono a
 * propósito: lo usa `chat.subscribe`, que responde sin await, y el registro
 * pesa unos pocos KB. Solo responde qué dice el registro: que el pane siga
 * vivo lo confirma quien llama, con `tmux has-session`.
 */
export function buscarPaneTmuxRegistrado(sessionIds: Array<string | null | undefined>): string | null {
  const buscados = new Set(sessionIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
  if (buscados.size === 0) {
    return null;
  }

  let registro: Record<string, RegistroEntry>;
  try {
    const data = JSON.parse(readFileSync(rutaRegistroSesionesTmux(), 'utf8')) as unknown;
    if (!data || typeof data !== 'object') {
      return null;
    }
    registro = data as Record<string, RegistroEntry>;
  } catch {
    return null;
  }

  for (const [clave, entry] of Object.entries(registro)) {
    if (entry.estado !== 'viva') continue;
    if (typeof entry.session_id !== 'string' || !buscados.has(entry.session_id)) continue;
    const nombre = typeof entry.nombre === 'string' && entry.nombre ? entry.nombre : clave;
    if (NOMBRE_TMUX_PATTERN.test(nombre)) {
      return nombre;
    }
  }
  return null;
}

/**
 * La fila que deja `createPendingTmuxSession` y que todavía no tiene
 * transcript: no hay conversación que retomar por `--resume`, y el único
 * camino para hablarle es el pane donde corre.
 */
export function esFilaTmuxSinTranscript(session: {
  session_id: string;
  provider_session_id: string | null;
  jsonl_path: string | null;
}): boolean {
  return !session.jsonl_path && session.provider_session_id === session.session_id;
}
