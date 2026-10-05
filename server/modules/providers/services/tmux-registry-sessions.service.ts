import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

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
  /**
   * `session_id` de filas que ya existían y esta pasada volvió a la barra
   * (desarchivó la sesión o su proyecto). No son filas nuevas, pero el
   * sidebar tiene que enterarse igual.
   */
  reactivadas: string[];
  /** `session_id` de filas pendientes borradas porque ya no están vivas. */
  podadas: string[];
};

const execFileAsync = promisify(execFile);

// Mismo charset que `nombreTmux()` y que acepta tmux-bridge: un nombre fuera
// de esto no llega nunca a un `tmux -t`.
const NOMBRE_TMUX_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Directorio del pane de tmux `nombre`, o `null` si no existe o no responde.
 * `=nombre:` fuerza el match exacto, igual que en tmux-bridge.
 */
async function defaultCwdDePane(nombre: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'tmux',
      ['display-message', '-p', '-t', `=${nombre}:`, '#{pane_current_path}'],
      { timeout: 2_000 },
    );
    const cwd = stdout.trim();
    return cwd && path.isAbsolute(cwd) ? cwd : null;
  } catch {
    return null;
  }
}

/**
 * `nombre` sigue vivo en tmux de verdad, sin importar lo que diga el
 * registro. `=nombre` fuerza el match exacto, igual que en `defaultCwdDePane`
 * y en tmux-bridge: sin el `=`, `has-session` matchea por prefijo.
 */
async function defaultTmuxVivo(nombre: string): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['has-session', '-t', `=${nombre}`], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

export type SincronizacionTmuxDeps = {
  /** Solo para tests: resuelve el cwd de un pane sin tocar tmux. */
  cwdDePane?: (nombre: string) => Promise<string | null>;
  /** Solo para tests: verifica si el pane de `nombre` sigue vivo de verdad. */
  tmuxVivo?: (nombre: string) => Promise<boolean>;
};

/**
 * Bug del 30-sep: `registro-sesion.sh` escribe la entrada en `SessionStart`
 * con `nombre` y `session_id` pero sin `cwd`, que recién completa
 * `sesiones.py` (ciclo de 10 min u `orquestar.py listar`). Mientras tanto la
 * sesión no llegaba al sidebar. Si falta, se lo pide al pane vivo.
 */
async function resolverCwd(
  entry: RegistroEntry,
  nombre: string,
  cwdDePane: (nombre: string) => Promise<string | null>,
): Promise<string | null> {
  if (typeof entry.cwd === 'string' && path.isAbsolute(entry.cwd)) {
    return entry.cwd;
  }
  if (entry.cwd !== undefined && entry.cwd !== null && entry.cwd !== '') {
    // Un cwd presente pero inválido es un registro raro: no se adivina.
    return null;
  }
  if (!NOMBRE_TMUX_PATTERN.test(nombre)) {
    return null;
  }
  return cwdDePane(nombre);
}

export async function sincronizarSesionesTmuxSinTranscript(
  { cwdDePane = defaultCwdDePane, tmuxVivo = defaultTmuxVivo }: SincronizacionTmuxDeps = {},
): Promise<SincronizacionTmuxResult> {
  const registro = await leerRegistro();
  if (!registro) {
    // Sin registro legible no se poda: se leería como "murieron todas".
    return { indexadas: [], reactivadas: [], podadas: [] };
  }

  // Filas pendientes de ANTES de esta pasada: son las únicas candidatas a
  // podarse, y por eso las únicas para las que vale la pena preguntarle a
  // tmux de verdad más abajo (Fase 8). Una recién indexada en esta misma
  // pasada obviamente está viva — se acaba de crear — y no entra acá.
  const pendientesPrevias = sessionsDb.listPendingTmuxSessionIds();
  const nombrePorSessionId = new Map<string, string>();

  const vivas: string[] = [];
  const indexadas: string[] = [];
  const reactivadas: string[] = [];

  for (const [clave, entry] of Object.entries(registro)) {
    if (entry.estado !== 'viva') continue;
    if (typeof entry.session_id !== 'string' || !SESSION_ID_PATTERN.test(entry.session_id)) continue;
    const nombre = typeof entry.nombre === 'string' && entry.nombre ? entry.nombre : clave;
    // Viva según el registro alcanza para no podarla, aunque el cwd no se
    // resuelva en esta pasada (un `tmux` que no respondió a tiempo). Se
    // verifica contra tmux de verdad más abajo, no acá.
    vivas.push(entry.session_id);
    nombrePorSessionId.set(entry.session_id, nombre);
    if (entry.cwd === undefined && sessionsDb.getSessionById(entry.session_id)) {
      // Ya indexada: no hace falta preguntarle a tmux en cada pasada.
      continue;
    }
    const cwd = await resolverCwd(entry, nombre, cwdDePane);
    if (!cwd) continue;
    const creada = typeof entry.creada === 'number' && entry.creada > 0
      ? new Date(entry.creada * 1000).toISOString()
      : undefined;

    try {
      if (sessionsDb.createPendingTmuxSession(entry.session_id, cwd, nombre, creada)) {
        indexadas.push(entry.session_id);
      } else if (sessionsDb.reactivarSiHayActividadNueva(entry.session_id)) {
        // La fila ya existía (archivada, o su proyecto): solo se reactivó, y
        // sin esto el sidebar no se enteraba hasta el próximo refresco.
        reactivadas.push(entry.session_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('No se pudo indexar la sesión tmux sin transcript', { nombre, error: message });
    }
  }

  // `estado: 'viva'` puede estar desactualizado: `orquestar.py dormir` mata
  // el pane pero nunca reescribe `sesiones.json` (anota en `hibernadas.json`,
  // mismo directorio — Fase 8 de `05-octubre-revision-punta-a-punta.md`). Sin
  // esto, una pendiente dormida se quedaba "viva" para siempre en la DB. Solo
  // se verifica lo que ya era pendiente antes de esta pasada: acotado al
  // puñado de filas sin transcript, nunca a todo el registro.
  const vivasVerificadas: string[] = [];
  for (const sessionId of vivas) {
    if (!pendientesPrevias.has(sessionId)) {
      vivasVerificadas.push(sessionId);
      continue;
    }
    const nombre = nombrePorSessionId.get(sessionId);
    if (nombre && (await tmuxVivo(nombre))) {
      vivasVerificadas.push(sessionId);
    }
  }

  const podadas = sessionsDb.deletePendingTmuxSessionsExcept(vivasVerificadas);
  return { indexadas, reactivadas, podadas };
}

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
