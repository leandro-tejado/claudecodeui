import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import { promisify } from 'node:util';

import { sessionsDb } from '@/modules/database/index.js';
import { sessionsService } from '@/modules/providers/index.js';
import { nombreTmux } from '@/modules/websocket/services/shell-websocket.service.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import type { AnyRecord, LLMProvider, NormalizedMessage } from '@/shared/types.js';

const execFileAsync = promisify(execFile);

/**
 * Bridges the chat websocket to a running tmux pane instead of a
 * `stream-json` child process. `enviarPrompt` writes the way a human would
 * type; everything the model answers is read back from the same `.jsonl`
 * transcript the REST history endpoint already serves, never from
 * `capture-pane` (that stays as a fallback for stuck dialogs — see the
 * "Peligros" section of Fase 3 in the plan).
 */

// Matches `nombreTmux()` in shell-websocket.service.ts: the only charset a
// tmux session name coming out of this app can ever contain. Any other
// string is refused outright — a name is either the deterministic one this
// server computed itself, or it does not get near `tmux`.
const TMUX_SESSION_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

export class InvalidTmuxSessionNameError extends Error {}

function assertNombreSesionValido(nombreSesion: string): void {
  if (!TMUX_SESSION_NAME_PATTERN.test(nombreSesion)) {
    throw new InvalidTmuxSessionNameError(
      `Nombre de sesion de tmux invalido: "${nombreSesion}". Solo se aceptan nombres generados por nombreTmux().`
    );
  }
}

export type TmuxBridgeDependencies = {
  /** Overridable for tests; real default shells out to `tmux send-keys -l`. */
  sendKeysLiteral: (nombreSesion: string, payload: string) => Promise<void>;
  /** Overridable for tests; real default shells out to `tmux send-keys Enter`. */
  sendEnter: (nombreSesion: string) => Promise<void>;
  /** Overridable for tests; real default shells out to `tmux has-session`. */
  hasSession: (nombreSesion: string) => boolean;
};

/**
 * `=name:` forces tmux to match the target session by exact name (the
 * trailing `:` is required for pane-level commands like `send-keys` and
 * `capture-pane` — `=name` alone resolves the session but then fails with
 * "can't find pane", verified empirically 16-sep on this VPS's tmux 3.4).
 * Without the `=`, tmux's target lookup accepts a leading-string match —
 * confirmed the same day by a sibling agent's fix to `hibernar.py`
 * (`revivir()`'s `has-session -t <nombre>` matched "-1" against a live "-10"
 * session and reported a false "ya existe"). Every `-t` target in this file
 * addresses a name this server itself generated with `nombreTmux()`, so it
 * must resolve to that exact session and no other.
 */
function targetExacto(nombreSesion: string): string {
  return `=${nombreSesion}:`;
}

async function defaultSendKeysLiteral(nombreSesion: string, payload: string): Promise<void> {
  // `-l` = literal: tmux writes the bytes to the pane as-is, no key-name
  // parsing. `--` closes option parsing before the payload, so a prompt that
  // starts with `-` cannot be read as another flag. The payload travels as
  // one argv element through `execFile` — never through a shell — so nothing
  // in it is ever interpolated into a command line.
  await execFileAsync('tmux', ['send-keys', '-t', targetExacto(nombreSesion), '-l', '--', payload]);
}

async function defaultSendEnter(nombreSesion: string): Promise<void> {
  // Sent as its own call, with tmux's own `Enter` key name — never appended
  // to the literal payload above, so a prompt with no trailing newline still
  // submits, and a multi-line one only submits once, after the whole paste.
  await execFileAsync('tmux', ['send-keys', '-t', targetExacto(nombreSesion), 'Enter']);
}

function defaultHasSession(nombreSesion: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', targetExacto(nombreSesion)], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const defaultDependencies: TmuxBridgeDependencies = {
  sendKeysLiteral: defaultSendKeysLiteral,
  sendEnter: defaultSendEnter,
  hasSession: defaultHasSession,
};

/**
 * Sends a prompt to an existing tmux session the way a person would type it.
 *
 * Single-line prompts go straight through. Multi-line ones are wrapped in a
 * bracketed-paste envelope (`ESC[200~ ... ESC[201~`) so the pane's readline
 * treats the whole block as one paste instead of submitting on every
 * embedded newline — `Enter` still arrives afterwards, as its own call, to
 * actually submit.
 */
export async function enviarPrompt(
  nombreSesion: string,
  texto: string,
  dependencies: TmuxBridgeDependencies = defaultDependencies,
): Promise<void> {
  assertNombreSesionValido(nombreSesion);

  const esMultilinea = texto.includes('\n');
  const payload = esMultilinea ? `${BRACKETED_PASTE_START}${texto}${BRACKETED_PASTE_END}` : texto;

  await dependencies.sendKeysLiteral(nombreSesion, payload);
  await dependencies.sendEnter(nombreSesion);
}

/** True when a tmux session with exactly this name is alive right now. */
export function tieneSesionTmux(
  nombreSesion: string,
  dependencies: Pick<TmuxBridgeDependencies, 'hasSession'> = defaultDependencies,
): boolean {
  if (!TMUX_SESSION_NAME_PATTERN.test(nombreSesion)) {
    return false;
  }
  return dependencies.hasSession(nombreSesion);
}

/**
 * Raw JSONL row shape this module cares about — the handful of fields that
 * decide whether a turn ended, not the full transcript row.
 *
 * `isSidechain` (not `parent_tool_use_id`, which does not exist on any row
 * Claude Code writes) is the real field marking a subagent transcript row —
 * verified 16-sep against a live 393-line session file on this VPS
 * (`~/.claude/projects/-home-leantejado-worktrees-cloudcli-fase2-tmux/*.jsonl`):
 * 269 rows carry `isSidechain`, zero carry `parent_tool_use_id`. That same
 * file has zero top-level `type: "result"` rows — every row is `user` or
 * `assistant` (plus non-message metadata types); `result` is a
 * `--output-format stream-json` STDOUT frame, never something persisted to
 * the per-session `.jsonl` this module watches. The real end-of-turn signal
 * on disk is `message.stop_reason` on the last `assistant` row: `tool_use`
 * mid-turn, anything else (`end_turn`, `stop_sequence`, ...) once Claude is
 * done and waiting for the next prompt.
 */
export type FilaTranscriptCruda = {
  type?: unknown;
  sessionId?: unknown;
  isSidechain?: unknown;
  message?: { stop_reason?: unknown };
};

/**
 * True when the last row of the transcript is a finished assistant turn: an
 * `assistant` row (not a subagent's `isSidechain` row) whose
 * `message.stop_reason` is anything other than `tool_use` — the value Claude
 * Code writes while a tool call is still pending a result.
 *
 * Pure and synchronous on purpose: it is what makes end-of-turn testable
 * against a fixture instead of a live pty, and it is never the thing that
 * reads the file — callers hand it whatever row they already read.
 */
export function esFinDeTurno(filas: FilaTranscriptCruda[]): boolean {
  const ultima = filas[filas.length - 1];
  if (!ultima || ultima.isSidechain) {
    return false;
  }
  if (ultima.type !== 'assistant') {
    return false;
  }
  const stopReason = ultima.message?.stop_reason;
  return typeof stopReason === 'string' && stopReason !== 'tool_use';
}

/**
 * Reads the last row belonging to `providerSessionId` out of a transcript
 * file. Used only to answer "did the turn end", so it reads raw JSONL
 * instead of going through the normalized/cached history reader — one linear
 * scan of the tail fields, no full transcript normalization.
 */
export async function leerUltimaFilaCruda(
  jsonlPath: string,
  providerSessionId: string,
): Promise<FilaTranscriptCruda | null> {
  let ultima: FilaTranscriptCruda | null = null;
  const fileStream = fs.createReadStream(jsonlPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    try {
      const fila = JSON.parse(line) as FilaTranscriptCruda;
      if (fila.sessionId === providerSessionId) {
        ultima = fila;
      }
    } catch {
      // A row can be half-written while the CLI is still streaming into the
      // file; skip it, the next poll rereads it complete.
    }
  }

  return ultima;
}

type EstadoSesionPuente = {
  /** How many `NormalizedMessage`s from the cached history were already broadcast. */
  ultimaCantidadEmitida: number;
  /** Guards against re-announcing `complete` on every poll while the pane sits idle. */
  complecionAnunciada: boolean;
};

// Keyed by provider-native session id — the id the watcher actually has when
// a transcript file changes on disk. In-memory only: on a `systemctl
// restart` it resets to empty, which at worst re-broadcasts a few already-
// seen rows (deduped client-side by their stable transcript-derived id) —
// never a lost one, and never a stuck spinner, because "es de tmux" itself
// is never read from here (see `tieneSesionTmux`, which asks tmux directly).
const estadosPorProviderSessionId = new Map<string, EstadoSesionPuente>();

function obtenerOInicializarEstado(providerSessionId: string): EstadoSesionPuente {
  let estado = estadosPorProviderSessionId.get(providerSessionId);
  if (!estado) {
    estado = { ultimaCantidadEmitida: 0, complecionAnunciada: false };
    estadosPorProviderSessionId.set(providerSessionId, estado);
  }
  return estado;
}

/** Test-only: drops all in-memory bridge state between fixtures. */
export function _resetEstadoParaTests(): void {
  estadosPorProviderSessionId.clear();
}

function enviarATodosLosConectados(payload: AnyRecord): void {
  const serialized = JSON.stringify(payload);
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(serialized);
    }
  });
}

/**
 * Reacts to a transcript file change for a session that may be bridged.
 *
 * No-ops immediately unless a live tmux session exists under this session's
 * deterministic name — that check (not a registration table) is the whole
 * definition of "this app session runs in tmux", so it survives a service
 * restart with nothing to reload. When it is bridged: pulls the cached full
 * history (`sessionsService.fetchHistory`, which is the same
 * `session-history-cache`-backed reader the REST endpoint uses — no second
 * parse of the file), broadcasts whatever rows are new since the last poll,
 * and announces `complete` exactly once per turn by watching the raw JSONL's
 * closing `result` row.
 */
export async function manejarActualizacionTranscript(providerSessionIdOEspacioApp: string): Promise<void> {
  const session = sessionsDb.getSessionByProviderSessionId(providerSessionIdOEspacioApp)
    ?? sessionsDb.getSessionById(providerSessionIdOEspacioApp);
  if (!session || !session.jsonl_path || !session.provider_session_id) {
    return;
  }

  const nombreSesion = nombreTmux(session.project_path ?? '', session.session_id);
  if (!tieneSesionTmux(nombreSesion)) {
    return;
  }

  const providerSessionId = session.provider_session_id;
  const estado = obtenerOInicializarEstado(providerSessionId);

  const full = await sessionsService.fetchHistory(session.session_id, { limit: null, offset: 0 });
  const nuevas = full.messages.slice(estado.ultimaCantidadEmitida);
  estado.ultimaCantidadEmitida = full.messages.length;

  for (const mensaje of nuevas) {
    enviarATodosLosConectados(mensaje as unknown as AnyRecord);
  }

  const ultimaFila = await leerUltimaFilaCruda(session.jsonl_path, providerSessionId);
  const turnoTerminado = esFinDeTurno(ultimaFila ? [ultimaFila] : []);

  if (turnoTerminado && !estado.complecionAnunciada) {
    estado.complecionAnunciada = true;
    const completeEvent: NormalizedMessage & { success: boolean } = {
      id: `tmux_complete_${session.session_id}_${Date.now()}`,
      sessionId: session.session_id,
      provider: session.provider as LLMProvider,
      timestamp: new Date().toISOString(),
      kind: 'complete',
      success: true,
    };
    enviarATodosLosConectados(completeEvent as unknown as AnyRecord);
  } else if (!turnoTerminado) {
    estado.complecionAnunciada = false;
  }
}

export const tmuxBridgeService = {
  enviarPrompt,
  tieneSesionTmux,
  esFinDeTurno,
  leerUltimaFilaCruda,
  manejarActualizacionTranscript,
};
