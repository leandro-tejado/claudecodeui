import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';

import { sessionsDb } from '@/modules/database/index.js';
import { sessionsService } from '@/modules/providers/index.js';
import { SALIDAS_SYSTEM_PROMPT_APPEND } from '@/modules/salidas/index.js';
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

// Same charset the app already validates a provider-native session id
// against elsewhere (`SAFE_SESSION_ID_PATTERN` in shell-websocket.service.ts).
// Duplicated here rather than imported so this module never depends on that
// file exporting a private-looking constant; the two are meant to keep
// matching by inspection, not by import.
const SAFE_PROVIDER_SESSION_ID_PATTERN = /^[a-zA-Z0-9_.\-:]+$/;

export type CrearSesionDependencies = {
  /** Overridable for tests; real default shells out to `tmux has-session`. */
  hasSession: (nombreSesion: string) => boolean;
  /** Overridable for tests; real default writes the trust flags into `~/.claude.json`. */
  asegurarConfianzaProyecto: (cwd: string) => Promise<void>;
  /** Overridable for tests; real default shells out to `tmux new-session -d`. */
  crearSesionDetached: (nombreSesion: string, cwd: string, comandoArgv: string[]) => Promise<void>;
};

/**
 * Pre-approves both of Claude Code's interactive trust dialogs for `cwd` —
 * "Is this a project you created or one you trust?" and, when the project's
 * `CLAUDE.md` has external imports, "Only use Claude Code with files you
 * trust" — by writing the same two flags Claude Code itself persists after a
 * person clicks through them by hand (`hasTrustDialogAccepted`,
 * `hasClaudeMdExternalIncludesApproved`) into `~/.claude.json`.
 *
 * Called from `asegurarSesionTmux` only on the branch that is about to spawn
 * a brand-new pane (never on an already-live one — see its early
 * `hasSession` return), so this never re-reads/re-writes the file on every
 * message of a chat that is already open. Same rationale as the
 * `bypassPermissions` decision already in that function: gating one of these
 * two doors and not the other is security theater when the whole app runs
 * on this one account and disk. Verified 16-sep via `claude --help`: there
 * is no flag to skip either dialog in interactive/TUI mode — only via
 * pre-marking the directory trusted here, or via `-p`/non-interactive mode,
 * which this bridge's architecture (an attended-looking TUI driven by
 * `send-keys`) cannot use.
 *
 * Writes atomically (temp file + rename) so a process crash mid-write never
 * leaves `~/.claude.json` half-written for every other `claude` process
 * reading it. Does NOT lock against a concurrent writer — another live
 * `claude` process persisting its own usage counters at the same instant
 * can still lose its update to this one, or vice versa. That narrow race is
 * an accepted risk (documented in the plan's Análisis Crítico), not solved
 * here: it only opens when a genuinely new pane is created, not on every
 * turn, and no other code in this repo uses file locking for this file.
 *
 * `rutaClaudeJson` defaults to the real `~/.claude.json` and is only ever
 * overridden by tests, against a temp file — never against the real one.
 */
export async function defaultAsegurarConfianzaProyecto(
  cwd: string,
  rutaClaudeJson: string = path.join(os.homedir(), '.claude.json'),
): Promise<void> {
  let config: { projects?: Record<string, AnyRecord> };
  try {
    const contenidoCrudo = await fs.promises.readFile(rutaClaudeJson, 'utf8');
    config = JSON.parse(contenidoCrudo) as { projects?: Record<string, AnyRecord> };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    config = {};
  }

  config.projects = config.projects ?? {};
  config.projects[cwd] = {
    ...config.projects[cwd],
    hasTrustDialogAccepted: true,
    hasClaudeMdExternalIncludesApproved: true,
  };

  const rutaTemporal = `${rutaClaudeJson}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(rutaTemporal, JSON.stringify(config, null, 2));
  await fs.promises.rename(rutaTemporal, rutaClaudeJson);
}

async function defaultCrearSesionDetached(
  nombreSesion: string,
  cwd: string,
  comandoArgv: string[],
): Promise<void> {
  try {
    // Every element after `-c cwd` is its own argv entry — tmux execs the
    // first one directly with the rest as its arguments, no intermediate
    // shell parse of a composed string (verified empirically 16-sep: `tmux
    // new-session -d -s x bash -ic 'echo $HOME'` runs `bash` with argv
    // `['-ic', 'echo $HOME']`, `bash` alone doing the parsing of its own `-c`
    // string). `cwd` never has to survive a shell quote because of that — it
    // travels as one argv element, same as the tmux session name.
    await execFileAsync('tmux', ['new-session', '-d', '-s', nombreSesion, '-c', cwd, ...comandoArgv]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(`duplicate session: ${nombreSesion}`)) {
      // A concurrent caller already created it — not a failure, just a race
      // this function is supposed to be idempotent against.
      return;
    }
    throw error;
  }
}

const defaultCrearSesionDependencies: CrearSesionDependencies = {
  hasSession: defaultHasSession,
  asegurarConfianzaProyecto: defaultAsegurarConfianzaProyecto,
  crearSesionDetached: defaultCrearSesionDetached,
};

/**
 * Creates the tmux pane for a chat session that never had one — the "who
 * opens the pane the first time" gap the Fase 3 plan flags as unowned.
 * No-ops if a pane under this name is already alive.
 *
 * Runs `claude` with the permissions already decided in the plan
 * ("Decisión de permisos de la sesión desatendida": `bypassPermissions`, no
 * allowlist) — an unattended pane cannot be left waiting on a permission
 * dialog it has no way to answer. Resumes the provider-native session when
 * one already exists (falls back to a fresh `claude` if the resume fails —
 * same recovery `buildShellCommand` uses for the Shell UI, in
 * shell-websocket.service.ts, which this intentionally mirrors instead of
 * importing: touching that file is out of this fase's Alcance, and the two
 * recipes are short enough to keep in sync by inspection).
 *
 * For a session whose first turn never ran anywhere yet, this forces the
 * fresh `claude` process to use `appSessionId` (this app's own session id,
 * already a UUID) as its provider-native session id via `--session-id`,
 * instead of letting Claude Code mint a random one. Found empirically 16-sep:
 * without this, `sessionsDb.createSession` (called later by the file
 * watcher once the new transcript appears) keys its upsert on
 * `provider_session_id`, which this pending row does not have yet — nothing
 * in tmux mode announces the id early the way the in-process SDK runtime
 * does for `chat.send`. That upsert then falls through to
 * `INSERT ... ON CONFLICT(session_id)`, minting a second, disconnected
 * session row: the chat window still open on `appSessionId` never hears
 * about it again. Forcing the id closes that gap by making the eventual
 * upsert land on `ON CONFLICT(session_id)` against the *same* row instead.
 *
 * `providerSessionId` and `appSessionId` are both validated against the same
 * safe charset `shell-websocket.service.ts` already applies before either is
 * allowed inside the constructed shell string — `providerSessionId` comes
 * from this app's own database and `appSessionId` from its own session
 * allocator, but this is the one place in the module where a value travels
 * through a shell parse (`bash -ic "<command>"`) rather than as a bare
 * `execFile` argv element, so both get checked again here rather than
 * trusted on faith.
 *
 * Returns whether it actually created a pane (`false` when one was already
 * alive) — the caller uses that to decide whether the freshly spawned
 * `claude` process needs a moment before it can be typed into.
 */
export async function asegurarSesionTmux(
  nombreSesion: string,
  cwd: string,
  providerSessionId: string | null,
  appSessionId: string,
  dependencies: CrearSesionDependencies = defaultCrearSesionDependencies,
): Promise<boolean> {
  assertNombreSesionValido(nombreSesion);
  if (dependencies.hasSession(nombreSesion)) {
    return false;
  }
  if (!cwd) {
    throw new Error('asegurarSesionTmux requiere un cwd no vacio para abrir la pane.');
  }

  const bypassFlag = ' --dangerously-skip-permissions';
  // Single-quoted because the value is our own hardcoded constant (no
  // apostrophes in it) rather than anything the caller supplied — same
  // reasoning `bash -ic` already gets trusted with for `bypassFlag` above.
  // Applies to every branch below: this function only ever runs on the
  // "no pane yet" path (the early `hasSession` return above), so every
  // `claude` invocation it can produce — including the `||` fallback — is a
  // brand-new process, never a message sent into an already-open pane.
  const appendSystemPromptFlag = ` --append-system-prompt '${SALIDAS_SYSTEM_PROMPT_APPEND}'`;
  const resumeId =
    providerSessionId && SAFE_PROVIDER_SESSION_ID_PATTERN.test(providerSessionId)
      ? providerSessionId
      : null;

  let claudeCommand: string;
  if (resumeId) {
    claudeCommand = `claude --resume "${resumeId}"${bypassFlag}${appendSystemPromptFlag} || claude${bypassFlag}${appendSystemPromptFlag}`;
  } else if (SAFE_PROVIDER_SESSION_ID_PATTERN.test(appSessionId)) {
    claudeCommand = `claude --session-id "${appSessionId}"${bypassFlag}${appendSystemPromptFlag} || claude${bypassFlag}${appendSystemPromptFlag}`;
  } else {
    claudeCommand = `claude${bypassFlag}${appendSystemPromptFlag}`;
  }

  await dependencies.asegurarConfianzaProyecto(cwd);
  await dependencies.crearSesionDetached(nombreSesion, cwd, ['bash', '-ic', claudeCommand]);
  return true;
}

async function defaultCapturarPaneCruda(nombreSesion: string): Promise<string> {
  const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-t', targetExacto(nombreSesion)]);
  return stdout;
}

/**
 * Waits, briefly and boundedly, for a freshly created pane to have painted
 * *something* — evidence that `bash -ic` finished sourcing `.bashrc` and
 * `claude` got far enough to draw its first frame, not a read of what it
 * drew. Measured empirically 16-sep on this VPS: `claude
 * --dangerously-skip-permissions` paints its first frame around 1.5s after
 * `tmux new-session`; this polls for up to 5s so a slow boot still clears it
 * with margin, and gives up silently past that (a pane that stays blank
 * forever — `claude` missing from PATH, a broken `.bashrc` — is a real
 * failure, but one `enviarPrompt` right after this will surface on its own
 * rather than one worth hanging a chat send over).
 *
 * This is the one place in the module `capture-pane` reads more than "is
 * there a stuck dialog": a blank pane is exactly the signal that typing into
 * it right now would race a shell that has not started reading its terminal
 * yet. It never reads the conversation itself — only whether the screen is
 * still empty.
 *
 * The first non-blank frame is the splash/banner, not proof the TUI's key
 * handler is wired up yet — verified 16-sep end-to-end on this VPS: a real
 * `enviarPrompt` fired the instant this resolved typed the prompt into the
 * input box correctly, but its `Enter` landed before Ink finished mounting
 * and was silently dropped, leaving the prompt sitting unsent until a second,
 * manual `Enter` submitted it. `settleMs` holds a little longer after the
 * first paint for exactly that mount window — still not reading what is on
 * screen, just giving the pane more time before anything is typed into it.
 */
export async function esperarPrimerRender(
  nombreSesion: string,
  dependencies: { capturarPaneCruda: (nombreSesion: string) => Promise<string> } = {
    capturarPaneCruda: defaultCapturarPaneCruda,
  },
): Promise<void> {
  const maxEsperaMs = 5000;
  const intervaloMs = 150;
  const settleMs = 1000;
  const inicio = Date.now();
  while (Date.now() - inicio < maxEsperaMs) {
    const pantalla = await dependencies.capturarPaneCruda(nombreSesion).catch(() => '');
    if (pantalla.trim().length > 0) {
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }
}

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
      // Only `user`/`assistant` rows carry a turn's `stop_reason` — Claude
      // Code also appends non-message bookkeeping rows after them (`system`,
      // `last-prompt`, `ai-title`, `mode`, `permission-mode`, `atis-latch`;
      // verified 16-sep on this VPS against a real Claude Code v2.1.273
      // transcript: six such rows landed after the last `assistant` row on
      // every turn). Skipping them here is what keeps `esFinDeTurno` looking
      // at the actual last turn instead of at whichever bookkeeping row
      // happened to get written last.
      if (fila.sessionId === providerSessionId && (fila.type === 'user' || fila.type === 'assistant')) {
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
 * and announces `complete` exactly once per turn by watching `message.
 * stop_reason` on the last raw `assistant` row (see `esFinDeTurno`) — never
 * `capture-pane`.
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
  asegurarSesionTmux,
  esperarPrimerRender,
  esFinDeTurno,
  leerUltimaFilaCruda,
  manejarActualizacionTranscript,
};
