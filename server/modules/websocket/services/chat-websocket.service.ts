import path from 'node:path';

import type { WebSocket } from 'ws';

import { sessionsDb } from '@/modules/database/index.js';
import { esFilaTmuxSinTranscript, providerModelsService, sessionsService } from '@/modules/providers/index.js';
import { chatRunRegistry } from '@/modules/websocket/services/chat-run-registry.service.js';
import { nombreTmux } from '@/modules/websocket/services/shell-websocket.service.js';
import { tmuxBridgeService } from '@/modules/websocket/services/tmux-bridge.service.js';
import {
  tmuxPaneVivoService,
  type EventoPaneVivo,
} from '@/modules/websocket/services/tmux-pane-vivo.service.js';
import {
  esperarQueSeDespeje,
  mensajePromptsTmux,
  responderPromptTmux,
  revisarPromptsTmux,
} from '@/modules/websocket/services/tmux-prompt.service.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import {
  getGlobalImageAssetsDir,
  isImageAttachmentDescriptor,
  normalizeAttachmentDescriptors,
  type ChatAttachmentDescriptor,
} from '@/shared/image-attachments.js';
import type {
  AnyRecord,
  AuthenticatedWebSocketRequest,
  LLMProvider,
  ProviderPermissionDecision,
  ProviderRuntimeWriter,
} from '@/shared/types.js';
import { parseIncomingJsonObject } from '@/shared/utils.js';

/**
 * Trust boundary for client-supplied image attachments: chat.send options come
 * straight from the browser, and the provider runtimes read the referenced
 * files off disk (Claude base64-encodes them into the prompt). Only images
 * that live directly inside the global upload store (`~/.cloudcli/assets`,
 * where POST /api/assets/images puts them) are allowed through — anything
 * else (absolute paths elsewhere, traversal, subdirectories) is dropped.
 *
 * Exported for tests; `assetsRootOverride` exists only for them.
 */
export function filterAttachmentsToUploadStore(
  attachments: unknown,
  assetsRootOverride?: string,
): ChatAttachmentDescriptor[] {
  const assetsRoot = path.resolve(assetsRootOverride ?? getGlobalImageAssetsDir());

  return normalizeAttachmentDescriptors(attachments).filter((descriptor) => {
    // Relative paths are anchored in the store; absolute ones must already be in it.
    const resolved = path.resolve(assetsRoot, descriptor.path);
    const relative = path.relative(assetsRoot, resolved);
    const isDirectChild =
      relative.length > 0 &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative) &&
      !relative.includes(path.sep) &&
      !relative.includes('/');

    if (!isDirectChild) {
      console.warn(`[Chat] Dropping attachment outside the upload store: ${descriptor.path}`);
    }
    return isDirectChild;
  });
}

/** Backward-compatible image filter consumed by existing websocket tests. */
export function filterImagesToUploadStore(
  images: unknown,
  assetsRootOverride?: string,
): ChatAttachmentDescriptor[] {
  return filterAttachmentsToUploadStore(images, assetsRootOverride);
}

/** Application boundary for dispatching provider runs and approvals. */
export type ProviderRuntimeGateway = {
  hasRuntime(provider: string): boolean;
  run(
    provider: LLMProvider,
    command: string,
    options: AnyRecord,
    writer: ProviderRuntimeWriter,
  ): Promise<unknown>;
  abort(provider: LLMProvider, sessionId: string): Promise<boolean>;
  stopBackgroundTask(provider: LLMProvider, sessionId: string, taskId: string): Promise<boolean>;
  /** Whether a provider runtime still holds background work for the session after its turn ended. */
  hasBackgroundWork(sessionId: string): boolean;
  resolveToolApproval(requestId: string, payload: ProviderPermissionDecision): void;
  getPendingApprovalsForSession(sessionId: string): unknown[];
};

type ChatWebSocketDependencies = {
  /** Central dispatcher for every provider SDK/CLI runtime. */
  runtime: ProviderRuntimeGateway;
};

/**
 * Extracts the authenticated request user id in the formats currently produced
 * by platform and OSS auth code paths.
 */
function readRequestUserId(
  request: AuthenticatedWebSocketRequest | undefined
): string | number | null {
  const user = request?.user;
  if (!user) {
    return null;
  }

  if (typeof user.id === 'string' || typeof user.id === 'number') {
    return user.id;
  }

  if (typeof user.userId === 'string' || typeof user.userId === 'number') {
    return user.userId;
  }

  return null;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WS_OPEN_STATE) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Reports a protocol-level failure to the requesting client.
 *
 * Protocol errors deliberately use their own `kind` (instead of the provider
 * `error` message kind) so the frontend can distinguish "your request was
 * invalid" from "the model run produced an error" without inspecting text.
 */
function sendProtocolError(
  ws: WebSocket,
  code: string,
  error: string,
  sessionId?: string,
  extra: AnyRecord = {},
): void {
  sendJson(ws, {
    kind: 'protocol_error',
    code,
    error,
    sessionId: sessionId ?? null,
    ...extra,
    timestamp: new Date().toISOString(),
  });
}

// The id of the sender's optimistic echo (`local_…`). Only ever echoed back,
// never used to look anything up, but still bounded.
const CLIENT_MESSAGE_ID_PATTERN = /^local_[A-Za-z0-9_]{1,80}$/;

function readClientMessageId(data: AnyRecord): string | null {
  return typeof data.clientMessageId === 'string' && CLIENT_MESSAGE_ID_PATTERN.test(data.clientMessageId)
    ? data.clientMessageId
    : null;
}

/**
 * Tells clients what became of a sent message: `sent` when its run started,
 * `queued` while it waits for the run in progress. Sent to every connected
 * client, like the tmux busy event: the sender may have reconnected on a new
 * socket by the time a queued message leaves the queue, and a client without
 * that echo ignores the frame.
 */
function broadcastMessageStatus(
  sessionId: string,
  clientMessageId: string,
  status: 'sent' | 'queued',
  extra: AnyRecord = {},
): void {
  const frame = JSON.stringify({
    kind: 'message_status',
    sessionId,
    clientMessageId,
    status,
    ...extra,
    timestamp: new Date().toISOString(),
  });
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(frame);
    }
  });
}

/**
 * Fase 7 Paso 4: difunde un evento del lector del pane en vivo (`activity`,
 * `stream_delta` del borrador, o `stream_reemplazo` al cerrarlo) a todos los
 * clientes conectados, igual que `busyEvent`/`broadcastMessageStatus` — el
 * cliente filtra por `sessionId`, no hay suscripción fina por socket.
 */
function emitirEventoPaneVivo(evento: EventoPaneVivo): void {
  const frame = JSON.stringify(evento);
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(frame);
    }
  });
}

/**
 * Bajas de `tmuxPaneVivoService.suscribirPaneVivo` activas para cada socket,
 * por `providerSessionId`. Un `WeakMap` para que un socket que se cierra sin
 * pasar por `ws.on('close')` (no debería pasar, pero por si acaso) no deje
 * la entrada viva a propósito; aun así, `close` SIEMPRE llama a cada baja —
 * sin eso el `setInterval` de `capture-pane` sigue corriendo huérfano.
 */
const bajasPaneVivoPorWs = new WeakMap<WebSocket, Map<string, () => void>>();

/**
 * Messages sent while their session already had a run going, oldest first.
 *
 * Bug del 30-sep: those were refused with RUN_IN_PROGRESS, and the message
 * was simply gone — three sends in a row, three errors, nothing queued. Now
 * each waits here and starts its turn when the run in front of it ends.
 * In memory on purpose: a restart ends every run anyway, and the composer's
 * own durable queue (session_drafts) covers the message the client already
 * knew to hold back.
 */
type PendingSend = {
  ws: WebSocket;
  userId: string | number | null;
  data: AnyRecord;
  dependencies: ChatWebSocketDependencies;
};

const pendingSends = new Map<string, PendingSend[]>();
let unsubscribeSendQueueDrain: (() => void) | null = null;

function enqueuePendingSend(sessionId: string, pending: PendingSend): number {
  if (!unsubscribeSendQueueDrain) {
    unsubscribeSendQueueDrain = chatRunRegistry.onRunCompleted(drainPendingSends);
  }
  const queue = pendingSends.get(sessionId) ?? [];
  queue.push(pending);
  pendingSends.set(sessionId, queue);
  return queue.length;
}

/** Starts the next waiting message's turn, if the session is free. */
function drainPendingSends(sessionId: string): void {
  if (chatRunRegistry.isProcessing(sessionId)) {
    return;
  }
  const queue = pendingSends.get(sessionId);
  const next = queue?.shift();
  if (!queue || !next) {
    return;
  }
  if (queue.length === 0) {
    pendingSends.delete(sessionId);
  }

  const ws = next.ws.readyState === WS_OPEN_STATE ? next.ws : null;
  // Re-read: the session may have been deleted while the message waited.
  const session = sessionsDb.getSessionById(sessionId);
  if (!session) {
    if (ws) {
      sendProtocolError(ws, 'SESSION_NOT_FOUND', `Session "${sessionId}" was not found.`, sessionId, {
        clientMessageId: readClientMessageId(next.data),
      });
    }
    drainPendingSends(sessionId);
    return;
  }

  void dispatchRun(ws, next.userId, sessionId, session, next.data, next.dependencies, {}, undefined, {
    fromQueue: true,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Chat] Queued message failed to start', { sessionId, error: message });
  });
}

/** Test-only: forgets every waiting message. */
export function _resetPendingSendsForTests(): void {
  pendingSends.clear();
  unsubscribeSendQueueDrain?.();
  unsubscribeSendQueueDrain = null;
}

function readRequiredSessionId(data: AnyRecord): string | null {
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
  return sessionId.length > 0 ? sessionId : null;
}

const MENSAJE_TMUX_SESSION_GONE =
  'Esta sesión corría en una terminal tmux que ya se cerró sin llegar a guardar ninguna conversación: no hay nada que retomar. Abrí una sesión nueva.';

const MENSAJE_TMUX_PANE_VIVO =
  'Esta sesión corre en una terminal tmux viva: el mensaje tiene que ir por ahí (chat.send-tmux), no por un turno nuevo del SDK.';

/**
 * Handles `chat.send`: resolves the session row (provider, project path, and
 * provider-native id all come from the database — never from the client),
 * registers the run, and dispatches to the provider runtime.
 */
async function handleChatSend(
  ws: WebSocket,
  userId: string | number | null,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies
): Promise<void> {
  const resolved = resolveSendTarget(ws, data, dependencies, 'chat.send');
  if (!resolved) {
    return;
  }

  // A session with a live pane (propio o externo — `orquestar.py`, `ct`) ya
  // tiene un REPL escribiendo su transcript: un `--resume` del SDK encima
  // sería un segundo proceso sobre el mismo archivo ("doble envío", Fase 7
  // Paso 5). El camino feliz del cliente ya elige `chat.send-tmux` en vez de
  // `chat.send` para una sesión así (lee `runsInTmux` del ack de
  // `chat.subscribe`); llegar hasta aquí con un pane vivo es un cliente con
  // estado viejo o una carrera, así que se rechaza en vez de reenrutar en
  // silencio como antes — reenrutar escondía el caso en el que el cliente
  // SÍ debería estar en modo tmux y no lo está.
  if (resolved.provider === 'claude') {
    const pane = tmuxBridgeService.resolverPaneTmux(resolved.session);
    if (pane) {
      sendProtocolError(ws, 'TMUX_PANE_VIVO', MENSAJE_TMUX_PANE_VIVO, resolved.sessionId);
      return;
    }
    if (esFilaTmuxSinTranscript(resolved.session)) {
      sendProtocolError(ws, 'TMUX_SESSION_GONE', MENSAJE_TMUX_SESSION_GONE, resolved.sessionId);
      return;
    }
  }

  // A run is going (or messages are already waiting for it): this one waits
  // its turn instead of being refused.
  const waiting = pendingSends.get(resolved.sessionId)?.length ?? 0;
  if (chatRunRegistry.isProcessing(resolved.sessionId) || waiting > 0) {
    const position = enqueuePendingSend(resolved.sessionId, { ws, userId, data, dependencies });
    const clientMessageId = readClientMessageId(data);
    if (clientMessageId) {
      broadcastMessageStatus(resolved.sessionId, clientMessageId, 'queued', { position });
    }
    if (!chatRunRegistry.isProcessing(resolved.sessionId)) {
      // Nothing is running to end and drain the queue: drain it now.
      setImmediate(() => drainPendingSends(resolved.sessionId));
    }
    return;
  }

  await dispatchRun(ws, userId, resolved.sessionId, resolved.session, data, dependencies);
}

/**
 * Handles `chat.send-tmux`: the tmux-bridge mode of `chat.send`.
 *
 * Nothing in this process runs the model — the prompt is typed into an
 * already-running tmux pane (`enviarPrompt`), and the answer is read back
 * later off the same `.jsonl` the REST history endpoint serves, pushed by
 * `sessions-watcher.service.ts` as the file changes. There is no
 * `chatRunRegistry` run to register: no runtime call is dispatched here, so
 * there is nothing for the registry's `run.writer` to attach to.
 *
 * The tmux session name is always resolved server-side — computed from the
 * session row (`project_path` + `session_id`, both from the DB) or, for a pane
 * CloudCLI did not open, looked up by `session_id` in the tmux registry — never
 * taken from the client. A name the browser could pick would be a command injection vector
 * into `tmux send-keys -t <name>`.
 */
async function handleChatSendTmux(
  ws: WebSocket,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies
): Promise<void> {
  const resolved = resolveSendTarget(ws, data, dependencies, 'chat.send-tmux');
  if (!resolved) {
    return;
  }
  const { sessionId, session, provider } = resolved;

  // The turn-completion and transcript-diffing logic in tmux-bridge.service.ts
  // (esFinDeTurno, manejarActualizacionTranscript) reads fields specific to
  // Claude Code's own .jsonl format; sessions-watcher.service.ts only calls it
  // for provider === 'claude' too. Refusing here keeps that assumption honest
  // instead of accepting a send that could never complete client-side.
  if (provider !== 'claude') {
    sendProtocolError(
      ws,
      'TMUX_PROVIDER_UNSUPPORTED',
      `El modo tmux todavia no soporta el proveedor "${provider}".`,
      sessionId
    );
    return;
  }

  const content = typeof data.content === 'string' ? data.content : '';
  if (!content.trim()) {
    sendProtocolError(ws, 'EMPTY_PROMPT', 'chat.send-tmux requires non-empty content.', sessionId);
    return;
  }

  const clientMessageId = readClientMessageId(data);
  // Fire-and-forget: ni esto ni el código viejo que reemplaza esperan a que
  // el mensaje termine de teclearse antes de volver — `ws.on('message', ...)`
  // no serializa un frame contra el siguiente de todos modos (cada mensaje
  // dispara su propio callback async, sin que el emisor espere al anterior),
  // así que no hay ninguna garantía de orden que perder acá.
  void entregarPorTmux(ws, sessionId, session, content, clientMessageId);
}

/**
 * El núcleo compartido de `chat.send-tmux` y del despacho sin cliente
 * (Fase 7 Paso 5, `runDetachedChatTurn`): resuelve el pane (puenteando uno
 * externo si hace falta), lo levanta si no existe, y teclea el mensaje —
 * reintentando si un diálogo propio de Claude Code lo frena.
 *
 * `ws` es `null` para un turno sin cliente conectado (un mensaje programado
 * sobre una sesión con pane vivo): ahí no hay a quién mandarle un
 * `protocol_error`, pero el resultado se devuelve igual para que el llamador
 * (p. ej. `scheduled-message-dispatcher.service.ts`, vía
 * `runDetachedChatTurn`) pueda marcar el mensaje fallido en vez de darlo por
 * enviado.
 */
async function entregarPorTmux(
  ws: WebSocket | null,
  sessionId: string,
  session: NonNullable<ReturnType<typeof sessionsDb.getSessionById>>,
  content: string,
  clientMessageId: string | null
): Promise<{ entregado: boolean; error: string | null }> {
  // A pane CloudCLI did not open (`orquestar.py`, `ct`) is only ever typed
  // into: its name comes from the tmux registry, and asegurarSesionTmux would
  // spawn a second `claude` under CloudCLI's own name if it looked dead.
  const pane = tmuxBridgeService.resolverPaneTmux(session);
  if (pane?.externo) {
    await tmuxBridgeService.puentearPaneExterno(session, pane.nombre);
  }
  const nombreSesion = pane?.nombre ?? nombreTmux(session.project_path ?? '', session.session_id);

  // A pending row from the tmux registry whose pane is gone never wrote a
  // transcript: reopening it would start an unrelated `claude`.
  if (!pane && esFilaTmuxSinTranscript(session)) {
    if (ws) sendProtocolError(ws, 'TMUX_SESSION_GONE', MENSAJE_TMUX_SESSION_GONE, sessionId);
    return { entregado: false, error: MENSAJE_TMUX_SESSION_GONE };
  }

  // A brand-new session (or one whose pane died) has nothing to type into
  // yet. asegurarSesionTmux is idempotent and a no-op when the pane is
  // already alive, so this is safe to call on every send, not just the first.
  if (!pane?.externo) {
    try {
      const creada = await tmuxBridgeService.asegurarSesionTmux(
        nombreSesion,
        session.project_path ?? '',
        session.provider_session_id ?? null,
        session.session_id,
        undefined,
        // La cuenta de la sesion: el pane nace con el token de esa cuenta.
        session.cuenta ?? null,
      );
      if (creada) {
        // The pane exists the instant `tmux new-session` returns, but the
        // `claude` process behind it does not start reading its terminal
        // immediately — see esperarPrimerRender for the measured boot time.
        await tmuxBridgeService.esperarPrimerRender(nombreSesion);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Chat] tmux-bridge could not open the pane', { sessionId, error: message });
      if (ws) sendProtocolError(ws, 'TMUX_SESSION_CREATE_FAILED', message, sessionId);
      return { entregado: false, error: message };
    }
  }

  if (!tmuxBridgeService.tieneSesionTmux(nombreSesion)) {
    const message = `No hay una sesion de tmux viva para "${sessionId}".`;
    if (ws) sendProtocolError(ws, 'TMUX_SESSION_NOT_FOUND', message, sessionId);
    return { entregado: false, error: message };
  }

  // Bug del 30-sep: una pregunta de AskUserQuestion se contestó sola con la
  // opción "(Recommended)": el `Enter` que cierra un mensaje elige la opción
  // del cursor. Y el 5-oct un diálogo propio de Claude Code se comió dos
  // mensajes que el chat dio por enviados. Con un diálogo abierto no se
  // teclea nada: el mensaje espera, y el chat dice por qué. Los mensajes de un
  // mismo pane salen de a uno y en orden, para que dos no se mezclen en el
  // cuadro de texto.
  if (panesFrenados.has(nombreSesion) && clientMessageId) {
    broadcastMessageStatus(sessionId, clientMessageId, 'queued', { reason: 'tmux_prompt' });
  }

  return new Promise((resolve) => {
    encolarEnPane(nombreSesion, async () => {
      let enEspera = panesFrenados.has(nombreSesion);
      for (;;) {
        const { resultado, error } = await teclearEnPane(ws, sessionId, nombreSesion, content, clientMessageId, {
          fromQueue: enEspera,
        });
        if (resultado !== 'dialogo') {
          resolve({ entregado: error === null, error });
          return;
        }
        if (!enEspera && clientMessageId) {
          broadcastMessageStatus(sessionId, clientMessageId, 'queued', { reason: 'tmux_prompt' });
        }
        enEspera = true;
        panesFrenados.add(nombreSesion);
        let vivo: boolean;
        try {
          vivo = await esperarQueSeDespeje(nombreSesion, {
            sigueVivo: () => tmuxBridgeService.tieneSesionTmux(nombreSesion),
          });
        } finally {
          panesFrenados.delete(nombreSesion);
        }
        if (!vivo) {
          const message = `La sesion de tmux de "${sessionId}" se cerro antes de poder mandar el mensaje.`;
          if (ws && ws.readyState === WS_OPEN_STATE) {
            sendProtocolError(ws, 'TMUX_SESSION_NOT_FOUND', message, sessionId, clientMessageId ? { clientMessageId } : {});
          }
          resolve({ entregado: false, error: message });
          return;
        }
      }
    });
  });
}

// Por pane: los mensajes en camino, encadenados para que salgan de a uno y
// en el orden en que llegaron.
const colasTmux = new Map<string, Promise<void>>();
// Los panes con un mensaje esperando a que se conteste un diálogo.
const panesFrenados = new Set<string>();

function encolarEnPane(pane: string, tarea: () => Promise<void>): void {
  const turno = (colasTmux.get(pane) ?? Promise.resolve())
    .then(tarea)
    .catch((error: unknown) => {
      console.error('[Chat] Queued tmux message failed', { pane, error: error instanceof Error ? error.message : error });
    });
  colasTmux.set(pane, turno);
  void turno.then(() => {
    if (colasTmux.get(pane) === turno) colasTmux.delete(pane);
  });
}

// Códigos sin el prefijo `TMUX_` a propósito: el cliente vuelve a
// `chat.send` ante un `TMUX_…`, y acá la sesión de tmux sigue viva.
const CODIGO_ENVIO_TMUX = {
  'sin-cuadro': 'PANE_NOT_AT_PROMPT',
  'cuadro-ocupado': 'PANE_INPUT_NOT_EMPTY',
  'no-aparecio': 'PANE_SEND_UNCONFIRMED',
  'no-salio': 'PANE_SEND_UNCONFIRMED',
} as const;

/**
 * Teclea el mensaje en el pane y, solo cuando el pane muestra que Claude lo
 * tomó, lo marca enviado y avisa que la sesión quedó ocupada. Devuelve
 * `dialogo` sin teclear nada si el pane tiene un diálogo abierto.
 *
 * `ws` es `null` para un turno sin cliente (`runDetachedChatTurn`, Paso 5 de
 * la Fase 7: un mensaje programado sobre una sesión con pane vivo también va
 * por `teclearEnPane`, nunca por el SDK) — ahí no hay a quién mandarle un
 * `protocol_error`, pero el resto (marcar enviado, avisar ocupado) es igual
 * para cualquier cliente conectado.
 */
async function teclearEnPane(
  ws: WebSocket | null,
  sessionId: string,
  nombreSesion: string,
  content: string,
  clientMessageId: string | null,
  { fromQueue = false }: { fromQueue?: boolean } = {},
): Promise<{ resultado: 'dialogo' | 'listo'; error: string | null }> {
  const conId = clientMessageId ? { clientMessageId } : {};
  let resultado: Awaited<ReturnType<typeof tmuxBridgeService.enviarPromptVerificado>>;
  try {
    resultado = await tmuxBridgeService.enviarPromptVerificado(nombreSesion, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Chat] tmux-bridge send failed', { sessionId, error: message });
    if (ws && ws.readyState === WS_OPEN_STATE) {
      sendProtocolError(ws, 'TMUX_SEND_FAILED', message, sessionId, conId);
    }
    return { resultado: 'listo', error: message };
  }

  if (!resultado.ok) {
    if (resultado.motivo === 'dialogo') return { resultado: 'dialogo', error: null };
    console.error('[Chat] tmux-bridge send not confirmed', { sessionId, motivo: resultado.motivo });
    if (ws && ws.readyState === WS_OPEN_STATE) {
      sendProtocolError(ws, CODIGO_ENVIO_TMUX[resultado.motivo], resultado.mensaje, sessionId, conId);
    }
    return { resultado: 'listo', error: resultado.mensaje };
  }

  if (clientMessageId) {
    broadcastMessageStatus(sessionId, clientMessageId, 'sent', fromQueue ? { fromQueue: true } : {});
  }

  // Paso 7: el pane queda ocupado desde ya — sin esto, un `chat.subscribe`
  // que llega antes del próximo poll del puente (hasta 6 s sin la vigilancia
  // rápida del Paso 3 todavía instalada) vería `ocupado: false`.
  tmuxBridgeService.marcarPaneOcupado(sessionsDb.getSessionById(sessionId)?.provider_session_id ?? null);

  // No provider run was dispatched, so no `complete` will come from
  // `chatRunRegistry` either. Every connected client (this one included) is
  // told the session is busy now; `sessions-watcher.service.ts` is what
  // clears it, once the transcript's closing `result` row shows the turn
  // actually ended.
  const busyEvent = {
    kind: 'status' as const,
    sessionId,
    text: null,
    canInterrupt: false,
    timestamp: new Date().toISOString(),
  };
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(JSON.stringify(busyEvent));
    }
  });
  return { resultado: 'listo', error: null };
}

type ResolvedSendTarget = {
  sessionId: string;
  session: NonNullable<ReturnType<typeof sessionsDb.getSessionById>>;
  provider: LLMProvider;
};

/**
 * Shared front half of `chat.send` and `chat.edit-send`: the session row and
 * provider come from the database, never from the client.
 */
function resolveSendTarget(
  ws: WebSocket,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies,
  frameName: string,
): ResolvedSendTarget | null {
  const sessionId = readRequiredSessionId(data);
  if (!sessionId) {
    sendProtocolError(ws, 'SESSION_ID_REQUIRED', `${frameName} requires a sessionId.`);
    return null;
  }

  const session = sessionsDb.getSessionById(sessionId);
  if (!session) {
    sendProtocolError(
      ws,
      'SESSION_NOT_FOUND',
      `Session "${sessionId}" was not found. Create it via POST /api/providers/sessions first.`,
      sessionId
    );
    return null;
  }

  const provider = session.provider as LLMProvider;
  if (!dependencies.runtime.hasRuntime(provider)) {
    sendProtocolError(ws, 'UNSUPPORTED_PROVIDER', `Provider "${provider}" is not available.`, sessionId);
    return null;
  }

  return { sessionId, session, provider };
}

/**
 * Registers the run and hands the turn to the provider runtime.
 *
 * `extraRuntimeOptions` is how an edited message asks the provider to resume
 * partway instead of continuing from the tip; a normal send passes nothing.
 */
async function dispatchRun(
  ws: WebSocket | null,
  userId: string | number | null,
  sessionId: string,
  session: NonNullable<ReturnType<typeof sessionsDb.getSessionById>>,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies,
  extraRuntimeOptions: AnyRecord = {},
  beforeRun?: (run: NonNullable<ReturnType<typeof chatRunRegistry.startRun>>) => void | Promise<void>,
  { fromQueue = false }: { fromQueue?: boolean } = {},
): Promise<{ started: boolean; error: string | null }> {
  const provider = session.provider as LLMProvider;

  const run = chatRunRegistry.startRun({
    appSessionId: sessionId,
    provider,
    providerSessionId: session.provider_session_id,
    connection: ws,
    userId,
  });

  if (!run) {
    if (ws) {
      sendProtocolError(
        ws,
        'RUN_IN_PROGRESS',
        `Session "${sessionId}" already has a run in progress.`,
        sessionId,
        { clientMessageId: readClientMessageId(data) },
      );
    }
    return { started: false, error: 'A run is already in progress for this session.' };
  }

  const clientMessageId = readClientMessageId(data);
  if (clientMessageId) {
    broadcastMessageStatus(sessionId, clientMessageId, 'sent', fromQueue ? { fromQueue: true } : {});
  }

  const clientOptions = (data.options ?? {}) as AnyRecord;
  const command = typeof data.content === 'string' ? data.content : '';

  // Record what this turn runs with so reopening the session later restores the
  // same model and reasoning effort, and so the resume path has a
  // session-scoped model answer to use.
  if (typeof clientOptions.model === 'string' && clientOptions.model.trim()) {
    providerModelsService.setSessionModel(provider, sessionId, clientOptions.model);
  }
  if (typeof clientOptions.effort === 'string' && clientOptions.effort.trim()) {
    providerModelsService.setSessionEffort(provider, sessionId, clientOptions.effort);
  }

  const attachmentCandidates = [
    ...normalizeAttachmentDescriptors(clientOptions.images),
    ...normalizeAttachmentDescriptors(clientOptions.files),
    ...normalizeAttachmentDescriptors(clientOptions.attachments),
  ];
  const verifiedAttachments = filterAttachmentsToUploadStore(attachmentCandidates);
  const uniqueAttachments = verifiedAttachments.filter(
    (descriptor, index, all) => all.findIndex((candidate) => candidate.path === descriptor.path) === index,
  );

  // The provider runtimes receive the stable app session id. When their
  // CLI/SDK needs the provider-native id for resume, they resolve it from the
  // session row themselves (sessionsService.resolveProviderSessionId).
  // Brand-new sessions have no provider id yet, so the runtime starts fresh
  // and announces one, which the gateway writer captures and maps back to the
  // app session id.
  const runtimeOptions: AnyRecord = {
    ...clientOptions,
    ...extraRuntimeOptions,
    // Attachments are re-validated server-side: only direct children of the
    // global upload store may reach provider runtimes or their file tools.
    attachments: uniqueAttachments,
    images: uniqueAttachments.filter(isImageAttachmentDescriptor),
    files: uniqueAttachments.filter((descriptor) => !isImageAttachmentDescriptor(descriptor)),
    sessionId,
    cwd: clientOptions.cwd ?? session.project_path ?? undefined,
    projectPath: session.project_path ?? clientOptions.projectPath,
    // La cuenta sale SIEMPRE de la fila de la sesion, nunca del cliente: un
    // cliente no elige con que token corre un turno ya creado.
    cuenta: session.cuenta ?? null,
  };

  let failure: string | null = null;
  try {
    // Runs only now that the session is reserved, because an edit rewinds the
    // conversation here and a rewind for a run that was never admitted cannot
    // be taken back. Inside the try so a rewind that throws still releases the
    // run instead of leaving the session processing forever.
    await beforeRun?.(run);
    await dependencies.runtime.run(provider, command, runtimeOptions, run.writer);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error(`[Chat] Provider runtime "${provider}" failed`, { sessionId, error: failure });
  } finally {
    // Safety net: a runtime that crashed (or resolved) without emitting its
    // terminal `complete` would otherwise leave the session stuck in
    // "processing" forever on every connected client. Scoped to THIS run —
    // a queued message can start the session's next run before this promise
    // settles, and the session-keyed completeRun would kill that new run.
    chatRunRegistry.completeRunIfCurrent(run, { exitCode: 1 });
  }

  return { started: true, error: failure };
}

/**
 * Handles `chat.edit-send`: replaces an already-sent message and everything
 * after it with a new turn.
 *
 * Nothing is deleted. The provider resumes the conversation partway and
 * appends the replacement, so the abandoned attempt stays in the transcript
 * file and is simply no longer part of the live conversation — the same shape
 * Claude Code's rewind and Codex's fork-with-cut-point produce.
 */
async function handleChatEditSend(
  ws: WebSocket,
  userId: string | number | null,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies
): Promise<void> {
  const resolved = resolveSendTarget(ws, data, dependencies, 'chat.edit-send');
  if (!resolved) {
    return;
  }

  const { sessionId, session, provider } = resolved;
  const anchorId = typeof data.anchorId === 'string' ? data.anchorId.trim() : '';
  if (!anchorId) {
    sendProtocolError(ws, 'ANCHOR_REQUIRED', 'chat.edit-send requires the anchorId of the message being replaced.', sessionId);
    return;
  }

  let resumeThroughId: string | null;
  try {
    const anchor = await sessionsService.resolveEditAnchor(sessionId, anchorId);
    if (!anchor) {
      sendProtocolError(
        ws,
        'EDIT_NOT_SUPPORTED',
        `Provider "${provider}" cannot replace an already-sent message.`,
        sessionId
      );
      return;
    }
    if (!anchor.found) {
      sendProtocolError(ws, 'ANCHOR_NOT_FOUND', 'That message is no longer in the transcript.', sessionId);
      return;
    }
    resumeThroughId = anchor.resumeThroughId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendProtocolError(ws, 'ANCHOR_LOOKUP_FAILED', `Could not read the transcript: ${message}`, sessionId);
    return;
  }

  // Providers split here on what their runtime can do. Claude resumes its
  // transcript partway, so the anchor rides along as a run option. Codex
  // cannot — a thread only grows — so the conversation is rewound on disk and
  // the run that follows is an ordinary resume of whatever the session then
  // points at. Which of the two applies is decided here; the rewind itself
  // waits until the run has actually been admitted.
  const rewinds = sessionsService.providerRewindsForEdit(sessionId);

  await dispatchRun(
    ws,
    userId,
    sessionId,
    session,
    data,
    dependencies,
    // `null` is meaningful: the edited turn was the first prompt, so the
    // conversation starts over instead of resuming.
    rewinds
      ? {}
      : { resumeAnchorId: resumeThroughId ?? undefined, resumeFromScratch: resumeThroughId === null },
    async (run) => {
      // Emitted through the run's writer so it is sequenced and replayed like
      // any other event — a second tab watching this session has to truncate
      // too.
      //
      // Before the rewind, not after it. A rewind that has to branch spawns a
      // process and waits on a JSON-RPC round trip, and holding the frame
      // until that came back left the message the user had just edited away
      // sitting on screen for about a second — the very flicker this feature
      // exists to avoid. Announcing first is safe because a rewind that fails
      // still ends the run, and the terminal `complete` makes every client
      // re-read the transcript, which puts back anything that turned out not
      // to have been replaced after all.
      run.writer.send({
        kind: 'history_truncated',
        provider,
        sessionId,
        anchorId,
      });

      if (rewinds) {
        try {
          await sessionsService.rewindSessionForEdit(sessionId, resumeThroughId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendProtocolError(ws, 'EDIT_REWIND_FAILED', `Could not rewind the conversation: ${message}`, sessionId);
          // Ends the run before the provider is asked to continue a
          // conversation that was not rewound after all.
          throw error;
        }
      }
    },
  );
}

/**
 * Handles `chat.abort`: cancels the run for one app session and emits the
 * terminal `complete` on its behalf (runtimes skip their own complete for
 * aborted runs, and the registry drops any duplicate).
 */
async function handleChatAbort(
  ws: WebSocket,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies
): Promise<void> {
  const sessionId = readRequiredSessionId(data);
  if (!sessionId) {
    sendProtocolError(ws, 'SESSION_ID_REQUIRED', 'chat.abort requires a sessionId.');
    return;
  }

  const run = chatRunRegistry.getRun(sessionId);
  if (!run || run.status !== 'running') {
    sendProtocolError(ws, 'NO_ACTIVE_RUN', `Session "${sessionId}" has no active run.`, sessionId);
    return;
  }

  const success = await dependencies.runtime.abort(run.provider, sessionId);

  chatRunRegistry.completeRun(sessionId, {
    exitCode: success ? 0 : 1,
    aborted: true,
  });
}

/**
 * Handles `chat.stop-task`: stops one background task of a session — an
 * agent, a workflow or a backgrounded command that is still going after its
 * turn ended. Unlike `chat.abort` there is no run to consult: the task lives
 * in the provider's held process, which is the only thing that can stop it.
 * The provider then reports the task as stopped on the session's stream, so
 * nothing is echoed back here on success.
 */
async function handleChatStopTask(
  ws: WebSocket,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies
): Promise<void> {
  const sessionId = readRequiredSessionId(data);
  if (!sessionId) {
    sendProtocolError(ws, 'SESSION_ID_REQUIRED', 'chat.stop-task requires a sessionId.');
    return;
  }

  const taskId = typeof data.taskId === 'string' ? data.taskId.trim() : '';
  if (!taskId) {
    sendProtocolError(ws, 'TASK_ID_REQUIRED', 'chat.stop-task requires a taskId.', sessionId);
    return;
  }

  const session = sessionsDb.getSessionById(sessionId);
  if (!session) {
    sendProtocolError(ws, 'SESSION_NOT_FOUND', `Session "${sessionId}" was not found.`, sessionId);
    return;
  }

  const stopped = await dependencies.runtime.stopBackgroundTask(
    session.provider as LLMProvider,
    sessionId,
    taskId,
  );
  if (!stopped) {
    sendProtocolError(
      ws,
      'NO_SUCH_TASK',
      `Session "${sessionId}" has no running background task "${taskId}".`,
      sessionId,
    );
  }
}

/**
 * Handles `chat.subscribe`: for each requested session, reports whether a run
 * is processing, re-attaches the live stream to this socket, replays missed
 * events (seq > lastSeq), and includes pending permission requests.
 *
 * This single message replaces the old `check-session-status`,
 * `get-pending-permissions`, and Claude-only writer reconnect flows.
 */
function handleChatSubscribe(
  ws: WebSocket,
  data: AnyRecord,
  dependencies: ChatWebSocketDependencies
): void {
  const targets = Array.isArray(data.sessions) ? data.sessions : [];

  for (const target of targets) {
    if (!target || typeof target !== 'object') {
      continue;
    }

    const sessionId = typeof (target as AnyRecord).sessionId === 'string'
      ? ((target as AnyRecord).sessionId as string).trim()
      : '';
    if (!sessionId) {
      continue;
    }

    const lastSeqRaw = (target as AnyRecord).lastSeq;
    const lastSeq = typeof lastSeqRaw === 'number' && Number.isFinite(lastSeqRaw)
      ? Math.max(0, Math.floor(lastSeqRaw))
      : 0;

    const run = chatRunRegistry.getRun(sessionId);
    const isProcessing = chatRunRegistry.isProcessing(sessionId);

    // Future live events for this run should land on the socket that asked —
    // this is what makes mid-stream page refreshes work for all providers.
    // A session whose turn ended but whose background work is still going
    // keeps producing events through the same writer (task progress, the
    // turn the CLI pushes when a task reports), so a tab opened during that
    // work attaches too; the registry keeps the run while the work lasts.
    if (isProcessing || dependencies.runtime.hasBackgroundWork(sessionId)) {
      chatRunRegistry.attachConnection(sessionId, ws);
    }

    // Pending approvals are tracked under the app session id inside the
    // Claude runtime, so they can be looked up directly.
    const pendingPermissions = dependencies.runtime.getPendingApprovalsForSession(sessionId);

    // "Runs in tmux" is never stored — it is answered live by asking tmux for
    // a session under this app session's deterministic name (see
    // `nombreTmux`/Fase 2). That is what lets it survive a `systemctl
    // restart` with nothing to reload: the flag is only ever a question, not
    // a row.
    const sessionRow = sessionsDb.getSessionById(sessionId);
    const pane = sessionRow ? tmuxBridgeService.resolverPaneTmux(sessionRow) : null;
    const runsInTmux = pane !== null;

    // Fase 7 Paso 4: mientras el pane esté puenteado, esta conexión sigue su
    // actividad (spinner/tool/borrador) — un solo `setInterval` de
    // `capture-pane` por sesión, compartido entre todos los sockets
    // suscriptos (ver `suscribirPaneVivo`), que se apaga en `ws.on('close')`.
    if (pane && sessionRow?.provider_session_id) {
      const providerSessionId = sessionRow.provider_session_id;
      let bajasDeEsteWs = bajasPaneVivoPorWs.get(ws);
      if (!bajasDeEsteWs) {
        bajasDeEsteWs = new Map();
        bajasPaneVivoPorWs.set(ws, bajasDeEsteWs);
      }
      if (!bajasDeEsteWs.has(providerSessionId)) {
        const baja = tmuxPaneVivoService.suscribirPaneVivo(
          ws,
          providerSessionId,
          pane.nombre,
          sessionId,
          emitirEventoPaneVivo,
        );
        bajasDeEsteWs.set(providerSessionId, baja);
      }
    }

    // Fase 7 Paso 7: `chatRunRegistry.isProcessing` es siempre `false` para
    // una sesión puenteada — ningún run de la SDK se registra para ella, así
    // que nunca hay nada que marcar "corriendo" ahí. El indicador real de
    // "ocupado" para tmux sale del último `activity` que leyó el pane en
    // vivo (Paso 4) cuando ya hay uno; si todavía no hubo ni un solo poll
    // (recién se suscribió, o nadie más estaba mirando esta sesión), se cae
    // al heurístico del `.jsonl` (`tmux-bridge.service.ts`,
    // `marcarPaneOcupado` en cada envío confirmado) en vez de asumir `false`
    // fijo. Sin esto, recargar la página a mitad de un turno tmux perdía el
    // indicador de "pensando" aunque el pane siguiera genuinamente ocupado.
    const actividadPane = runsInTmux
      ? tmuxPaneVivoService.ultimaActividadConocida(sessionRow?.provider_session_id ?? null)
      : null;
    const isProcessingParaAck = runsInTmux
      ? (actividadPane
          ? actividadPane.kind !== 'idle'
          : isProcessing || tmuxBridgeService.estaOcupadoTmux(sessionRow?.provider_session_id ?? null))
      : isProcessing;

    sendJson(ws, {
      kind: 'chat_subscribed',
      sessionId,
      isProcessing: isProcessingParaAck,
      lastSeq: run?.lastSeq ?? 0,
      pendingPermissions,
      runsInTmux,
      timestamp: new Date().toISOString(),
    });

    // Replay only for RUNNING runs, strictly after the ack. Completed runs
    // are fully persisted to the provider transcript and served over REST —
    // replaying them (e.g. after a page reload where the client's lastSeq is
    // 0) would duplicate messages the history fetch already returned.
    if (isProcessing) {
      for (const event of chatRunRegistry.replayEvents(sessionId, lastSeq)) {
        sendJson(ws, event);
      }
    }
  }
}

/**
 * Handles `chat.permission-response`: forwards a tool-approval decision to the
 * pending approval resolver (Claude is the only provider with interactive
 * approvals today, but the message is intentionally provider-neutral).
 */
function handlePermissionResponse(data: AnyRecord, dependencies: ChatWebSocketDependencies): void {
  if (typeof data.requestId !== 'string' || data.requestId.length === 0) {
    return;
  }

  dependencies.runtime.resolveToolApproval(data.requestId, {
    allow: Boolean(data.allow),
    updatedInput: data.updatedInput,
    message: typeof data.message === 'string' ? data.message : undefined,
    rememberEntry: data.rememberEntry,
  });
}

/**
 * Handles `chat.tmux-prompts`: the prompts tmux panes are waiting on right
 * now. A client asks once its listener is up (and again after a reconnect),
 * so a snapshot pushed at connection time can never land before anyone
 * listens. Reads the panes first: while nobody was connected the watcher was
 * not looking.
 */
async function handleTmuxPromptsRequest(ws: WebSocket): Promise<void> {
  await revisarPromptsTmux();
  sendJson(ws, mensajePromptsTmux());
}

/**
 * Handles `chat.tmux-prompt-response`: types the chosen option into the pane
 * that is waiting on it. A failure goes back as its own `tmux_prompt_error`
 * frame, not as `protocol_error`: that one would drop the session out of
 * tmux mode and idle it, and neither is true here.
 */
async function handleTmuxPromptResponse(ws: WebSocket, data: AnyRecord): Promise<void> {
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  const pane = typeof data.pane === 'string' ? data.pane : '';
  const promptId = typeof data.promptId === 'string' ? data.promptId : '';
  const tecla = typeof data.tecla === 'string' ? data.tecla : undefined;
  const opcion = typeof data.opcion === 'number' ? data.opcion : tecla === undefined ? -1 : undefined;
  const texto = typeof data.texto === 'string' ? data.texto : undefined;

  const resultado = await responderPromptTmux(
    { sessionId, pane, promptId, opcion, tecla, texto },
    {
      // Bridged before the key goes in, so the rows the answer unblocks
      // stream into the chat — same as a prompt typed from the chat.
      antesDeEnviar: async () => {
        const session = sessionsDb.getSessionById(sessionId);
        if (session && pane !== nombreTmux(session.project_path ?? '', session.session_id)) {
          await tmuxBridgeService.puentearPaneExterno(session, pane);
        }
      },
    },
  );

  if (!resultado.ok) {
    sendJson(ws, {
      kind: 'tmux_prompt_error',
      sessionId,
      pane,
      promptId,
      code: resultado.codigo,
      error: resultado.mensaje,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handles authenticated chat websocket messages used by the main chat panel.
 *
 * Inbound protocol (client to server):
 * - `chat.send`                { sessionId, content, options? }
 * - `chat.abort`               { sessionId }
 * - `chat.stop-task`           { sessionId, taskId }
 * - `chat.subscribe`           { sessions: [{ sessionId, lastSeq? }] }
 * - `chat.permission-response` { requestId, allow, updatedInput?, message?, rememberEntry? }
 * - `chat.tmux-prompts`        {}
 * - `chat.tmux-prompt-response` { sessionId, pane, promptId, opcion | tecla, texto? }
 *
 * Outbound protocol (server to client): every frame is `kind`-based — either
 * a provider `NormalizedMessage` (with `seq`) or a gateway event
 * (`chat_subscribed`, `session_upserted`, `loading_progress`,
 * `protocol_error`).
 */
/**
 * Runs a turn for a session with no client attached.
 *
 * Used by scheduled messages, which fire from a timer: there is no socket to
 * report errors to and no audience to stream to. The run is registered exactly
 * like an interactive one, so anyone who opens the session while it is going
 * subscribes and replays it from the start, and the session shows as busy
 * everywhere in the meantime.
 *
 * Resolves when the provider run settles. Returns false when the session has
 * gone away or is busy without `interruptActiveRun`, which the caller reports
 * on the schedule.
 */
export async function runDetachedChatTurn(
  input: {
    sessionId: string;
    userId: string | number | null;
    content: string;
    options?: AnyRecord;
    /**
     * Aborts a run already in progress instead of refusing to start. A
     * scheduled message sets this: the user picked the time knowing it might
     * land mid-run, so the timer outranks whatever is running.
     */
    interruptActiveRun?: boolean;
  },
  dependencies: ChatWebSocketDependencies,
): Promise<{ started: boolean; error: string | null }> {
  const session = sessionsDb.getSessionById(input.sessionId);
  if (!session) {
    return { started: false, error: 'The session no longer exists.' };
  }

  const provider = session.provider as LLMProvider;

  // Fase 7 Paso 5 ("el dispatcher"): un mensaje programado o encolado sobre
  // una sesión con pane vivo (propio o externo) va por `teclearEnPane`, igual
  // que `chat.send-tmux` — nunca por el SDK, porque eso sería un segundo
  // `claude --resume` escribiendo encima del mismo .jsonl que el pane ya
  // escribe. No hay `ws`: nadie puede ver un `protocol_error`, así que el
  // resultado se traduce a `{started, error}` para que el llamador (p. ej.
  // `scheduled-message-dispatcher.service.ts`) marque el mensaje fallido en
  // vez de darlo por enviado.
  if (provider === 'claude' && tmuxBridgeService.resolverPaneTmux(session)) {
    const { entregado, error } = await entregarPorTmux(null, input.sessionId, session, input.content, null);
    return { started: entregado, error };
  }

  if (!dependencies.runtime.hasRuntime(provider)) {
    return { started: false, error: `Provider "${provider}" is not available.` };
  }

  const activeRun = chatRunRegistry.getRun(input.sessionId);
  if (activeRun && activeRun.status === 'running') {
    if (!input.interruptActiveRun) {
      return { started: false, error: 'A run was already in progress for this session.' };
    }
    // Same shape as `chat.abort`: cancel the provider run and emit the
    // terminal `complete` on its behalf, so every watching client sees the
    // interrupted run end before this turn's stream begins. The interrupted
    // run's own dispatch settles later through completeRunIfCurrent, which is
    // scoped to that run and cannot touch the one started here.
    const aborted = await dependencies.runtime.abort(activeRun.provider, input.sessionId);
    chatRunRegistry.completeRun(input.sessionId, {
      exitCode: aborted ? 0 : 1,
      aborted: true,
    });
  }

  return dispatchRun(
    null,
    input.userId,
    input.sessionId,
    session,
    { sessionId: input.sessionId, content: input.content, options: input.options ?? {} },
    dependencies,
  );
}

export function handleChatConnection(
  ws: WebSocket,
  request: AuthenticatedWebSocketRequest,
  dependencies: ChatWebSocketDependencies
): void {
  console.log('[INFO] Chat WebSocket connected');
  connectedClients.add(ws);

  const userId = readRequestUserId(request);

  ws.on('message', async (rawMessage) => {
    try {
      const parsed = parseIncomingJsonObject(rawMessage);
      if (!parsed) {
        throw new Error('Invalid websocket payload');
      }

      const data = parsed as AnyRecord;
      const messageType = typeof data.type === 'string' ? data.type : '';

      switch (messageType) {
        case 'chat.edit-send':
          await handleChatEditSend(ws, userId, data, dependencies);
          return;
        case 'chat.send':
          await handleChatSend(ws, userId, data, dependencies);
          return;
        case 'chat.send-tmux':
          await handleChatSendTmux(ws, data, dependencies);
          return;
        case 'chat.abort':
          await handleChatAbort(ws, data, dependencies);
          return;
        case 'chat.stop-task':
          await handleChatStopTask(ws, data, dependencies);
          return;
        case 'chat.subscribe':
          handleChatSubscribe(ws, data, dependencies);
          return;
        case 'chat.permission-response':
          handlePermissionResponse(data, dependencies);
          return;
        case 'chat.tmux-prompts':
          await handleTmuxPromptsRequest(ws);
          return;
        case 'chat.tmux-prompt-response':
          await handleTmuxPromptResponse(ws, data);
          return;
        default:
          sendProtocolError(ws, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type "${messageType}".`);
          return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ERROR] Chat WebSocket error:', message);
      sendProtocolError(ws, 'INTERNAL_ERROR', message);
    }
  });

  ws.on('close', () => {
    console.log('[INFO] Chat client disconnected');
    connectedClients.delete(ws);
    // Fase 7 Paso 4: sin esto, el `setInterval` de `capture-pane` de una
    // sesión que este socket era el único mirando quedaba huérfano para
    // siempre (nunca se llega a 0 suscriptores en `tmuxPaneVivoService`).
    const bajas = bajasPaneVivoPorWs.get(ws);
    if (bajas) {
      for (const baja of bajas.values()) baja();
      bajasPaneVivoPorWs.delete(ws);
    }
  });
}
