import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import type { ServerEvent,MarkSessionIdle,MarkSessionProcessing,PendingPermissionRequest,ProjectSession,LLMProvider,NormalizedMessage,GetSessionActivity,MarkSessionBackground } from '@/shared/types';
import { showCompletionTitleIndicator } from '@/modules/chat/utils/pageTitleNotification';
import { playChatCompletionSound, playNotificationSound } from '@/shared/utils';
import { publishSessionBudget } from '@/modules/skin';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { collectRunningBackgroundTasks } from '@/modules/chat/utils/backgroundTasks';
import { appendStreamDelta, appendThinkingDelta, finalizeStreamBuffer, settleStreamBuffer } from '@/modules/chat/utils/streamBuffers';
import type { StreamBuffers } from '@/modules/chat/utils/streamBuffers';

/**
 * How long a session's main-thread activity label stays pinned to the
 * rotating action words' absence (no further delta) before "Pensando…"/the
 * tool name reappears. Mirrors `revelado.ts`'s `debeMostrarActividad` from
 * app-optimum-mkt (ported as a timer here, not imported — separate repos).
 */
const ACTIVITY_GAP_MS = 800;

const isActionablePermissionRequest = (request: { toolName?: unknown } | null | undefined): boolean => {
  return request?.toolName !== 'ExitPlanMode' && request?.toolName !== 'exit_plan_mode';
};

// Protocol errors that answer a stop request, not a send.
const NOT_ABOUT_A_SEND = new Set(['NO_ACTIVE_RUN', 'NO_SUCH_TASK', 'TASK_ID_REQUIRED']);

const hasActionablePermissionRequests = (requests: Array<{ toolName?: unknown }> | null | undefined): boolean => {
  return Array.isArray(requests) && requests.some((request) => isActionablePermissionRequest(request));
};

type UseChatRealtimeHandlersArgs = {
  isActive: boolean;
  subscribe: (listener: (event: ServerEvent) => void) => () => void;
  provider: LLMProvider;
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  setTokenBudget: (budget: Record<string, unknown> | null) => void;
  pendingPermissionRequests: PendingPermissionRequest[];
  setPendingPermissionRequests: Dispatch<SetStateAction<PendingPermissionRequest[]>>;
  /** Pending streamed text, one buffer per session (see `streamBuffers.ts`). */
  streamBuffersRef: MutableRefObject<StreamBuffers>;
  /**
   * Highest live `seq` observed per session. Essential for reconnect catch-up:
   * `chat.subscribe` sends this value as `lastSeq` so the server replays only
   * the events this client actually missed. Written here on every sequenced
   * frame; read wherever a `chat.subscribe` is sent (session open, reconnect).
   */
  lastSeqRef: MutableRefObject<Map<string, number>>;
  /** When each session's `chat.subscribe` was last sent; guards stale idle acks. */
  statusCheckSentAtRef: MutableRefObject<Map<string, number>>;
  onSessionProcessing?: MarkSessionProcessing;
  onSessionIdle?: MarkSessionIdle;
  /** Reports the tasks a session still runs once its turn ends, so it reads as background work rather than idle. */
  onSessionBackground?: MarkSessionBackground;
  getSessionActivity?: GetSessionActivity;
  onWebSocketReconnect?: () => void;
  requestLatestMessages: (sessionId: string, allowNetwork?: boolean) => Promise<void>;
  sessionStore: SessionStore;
  /**
   * Fired once per `complete` of the currently viewed session, success or
   * not — the Salidas panel's cue to re-list `.informes/` (an aborted run
   * can still have written a partial output worth showing).
   */
  onTurnComplete?: (sessionId: string) => void;
};

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

/**
 * Routes server events into the session store and processing-state map.
 *
 * This is intentionally a thin reducer over the unified `kind`-based
 * protocol: every frame is keyed by the stable app session id, so there is
 * no session-id handoff, no provider branching, and no navigation here.
 * Sidebar events (`session_upserted`, `loading_progress`) are handled by
 * `useProjectsState`, not in this hook.
 */
export function useChatRealtimeHandlers({
  isActive,
  subscribe,
  provider,
  selectedSession,
  currentSessionId,
  setTokenBudget,
  pendingPermissionRequests,
  setPendingPermissionRequests,
  streamBuffersRef,
  lastSeqRef,
  statusCheckSentAtRef,
  onSessionProcessing,
  onSessionIdle,
  onSessionBackground,
  getSessionActivity,
  onWebSocketReconnect,
  requestLatestMessages,
  sessionStore,
  onTurnComplete,
}: UseChatRealtimeHandlersArgs) {
  // Session switches can send `chat.subscribe` before this effect has a chance
  // to rebind the websocket listener. Read the visible session id from a ref
  // so a fast `chat_subscribed` ack is matched against the current view, not
  // the previous render's closed-over selection.
  const activeViewSessionIdRef = useRef<string | null>(selectedSession?.id || currentSessionId || null);
  activeViewSessionIdRef.current = selectedSession?.id || currentSessionId || null;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const { t } = useTranslation('chat');
  const thinkingLabelRef = useRef(t('claudeStatus.actions.thinking', { defaultValue: 'Thinking' }));
  thinkingLabelRef.current = t('claudeStatus.actions.thinking', { defaultValue: 'Thinking' });

  // Per-session "no token in the last 800ms" timers that bring "Pensando…"
  // (or the tool name) back once real answer text stops flowing. One map for
  // the whole hook lifetime, not per-effect-run, so a resubscribe never loses
  // track of a timer already armed for a session mid-turn.
  const activityGapTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = activityGapTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // Keep the latest pending-permission snapshot available to the websocket
  // listener so back-to-back permission events can dedupe and re-arm the
  // notification sound before React finishes a rerender.
  const pendingPermissionRequestsRef = useRef(pendingPermissionRequests);

  useEffect(() => {
    pendingPermissionRequestsRef.current = pendingPermissionRequests;
  }, [pendingPermissionRequests]);

  useEffect(() => {
    // What a session that has finished responding is left with: the tasks it
    // launched that are still running, or nothing, which marks it idle. The
    // store's records are what the transcript's cards fold their live status
    // from, so this reads the same answer they draw.
    const reportRemainingBackgroundWork = (sid: string) => {
      onSessionBackground?.(sid, collectRunningBackgroundTasks(normalizedToChatMessages(sessionStore.getMessages(sid))));
    };

    const clearActivityGapTimer = (sid: string) => {
      const timer = activityGapTimersRef.current.get(sid);
      if (timer) {
        clearTimeout(timer);
        activityGapTimersRef.current.delete(sid);
      }
    };

    // Pins the indicator to `label` (a tool name, or "Pensando…"), replacing
    // the rotating action words — the block just started, before its first
    // token, so this is what makes the indicator appear ahead of it (Fase 5,
    // paso 7). Cancels any pending reappear-after-gap timer: an explicit pin
    // always wins over one that was only guessing.
    const pinActivity = (sid: string, label: string) => {
      clearActivityGapTimer(sid);
      onSessionProcessing?.(sid, { statusText: label });
    };

    // Arms the 800ms-with-no-token timer that brings "Pensando…" back once a
    // text block that had started goes quiet again (a tool call starting
    // mid-answer, extended thinking resuming).
    const armActivityGap = (sid: string) => {
      clearActivityGapTimer(sid);
      const timer = setTimeout(() => {
        activityGapTimersRef.current.delete(sid);
        onSessionProcessing?.(sid, { statusText: thinkingLabelRef.current });
      }, ACTIVITY_GAP_MS);
      activityGapTimersRef.current.set(sid, timer);
    };

    // A real answer token just arrived: the indicator reverts to the
    // rotating words (Fase 5, paso 7 — "reemplaza las palabras rotando"),
    // and the 800ms gap timer is (re)armed in case the answer stalls again.
    const clearActivityPin = (sid: string) => {
      onSessionProcessing?.(sid, { statusText: null });
      armActivityGap(sid);
    };

    const handleEvent = (msg: ServerEvent) => {
      if (!msg.kind) {
        return;
      }

      const activeViewSessionId = activeViewSessionIdRef.current;
      const sid = (typeof msg.sessionId === 'string' && msg.sessionId) || activeViewSessionId;

      // Record replay progress for every sequenced live event.
      if (sid && typeof msg.seq === 'number') {
        const known = lastSeqRef.current.get(sid) ?? 0;
        if (msg.seq > known) {
          lastSeqRef.current.set(sid, msg.seq);
        }
      }

      switch (msg.kind) {
        case 'websocket_reconnected':
          onWebSocketReconnect?.();
          return;

        case 'history_truncated': {
          // An already-sent message was replaced. Every client watching this
          // session drops the superseded turns before the replacement streams
          // in, so a second tab does not end up showing the question twice.
          if (sid && typeof msg.anchorId === 'string') {
            sessionStore.truncateAt(sid, msg.anchorId);
          }
          return;
        }

        case 'chat_subscribed': {
          // Ack for chat.subscribe: authoritative processing state plus any
          // pending tool-permission prompts for the run.
          if (!sid) return;

          if (msg.isProcessing) {
            onSessionProcessing?.(sid);
          } else {
            // Idle ack: ignore it if a newer request started after the
            // subscribe was sent — the ack describes the older state.
            onSessionIdle?.(sid, {
              ifStartedBefore: statusCheckSentAtRef.current.get(sid),
            });
          }

          // Live answer to "does this session run in tmux" — never a stored
          // flag (see chat-websocket.service.ts), so every ack is a fresh
          // read, including one that flips a session back to `chat.send`
          // (its pane died, or was never there to begin with).
          if (typeof msg.runsInTmux === 'boolean') {
            sessionStore.setRunsInTmux(sid, msg.runsInTmux);
          }

          const isViewedSession = sid === activeViewSessionId;
          if (isViewedSession && Array.isArray(msg.pendingPermissions)) {
            const nextPendingPermissionRequests = msg.pendingPermissions as PendingPermissionRequest[];
            const hadActionablePermissionRequests = hasActionablePermissionRequests(pendingPermissionRequestsRef.current);
            const hasPendingActionablePermissionRequests = hasActionablePermissionRequests(nextPendingPermissionRequests);

            pendingPermissionRequestsRef.current = nextPendingPermissionRequests;
            setPendingPermissionRequests(nextPendingPermissionRequests);

            if (hasPendingActionablePermissionRequests && !hadActionablePermissionRequests) {
              void playNotificationSound();
            }
          }
          return;
        }

        case 'protocol_error': {
          console.error('[Chat] Protocol error:', msg.code, msg.error);
          if (sid) {
            // A tmux-mode failure (dead pane, creation failed, unsupported
            // provider) falls back to `chat.send` on the next attempt rather
            // than repeating a send that cannot work — `stream-json` is the
            // backup path exactly for this ("el camino viejo... pasa a ser
            // el respaldo, no el default").
            if (typeof msg.code === 'string' && msg.code.startsWith('TMUX_')) {
              sessionStore.setRunsInTmux(sid, false);
            }
            // Surface the failure in the conversation and stop the spinner —
            // the run never started (or was rejected), so no `complete` follows.
            // A refused stop request is not about the run: the task had
            // already settled, and idling here would drop a response in
            // flight on that session.
            // Nor is a refusal because a run is already going: that run is
            // still working, and idling here hid it (30-sep).
            if (
              msg.code !== 'NO_SUCH_TASK'
              && msg.code !== 'TASK_ID_REQUIRED'
              && msg.code !== 'RUN_IN_PROGRESS'
            ) {
              onSessionIdle?.(sid);
            }
            // The message this refusal was about says so on its echo. The
            // server names it when it can; otherwise it is the newest one of
            // this session still waiting for an answer.
            if (!NOT_ABOUT_A_SEND.has(String(msg.code))) {
              const failedId = typeof msg.clientMessageId === 'string'
                ? msg.clientMessageId
                : [...sessionStore.getMessages(sid)]
                  .reverse()
                  .find((message) => message.deliveryState === 'sending')?.id;
              if (failedId) {
                sessionStore.setDeliveryState(sid, failedId, 'failed');
              }
            }
            sessionStore.appendRealtime(sid, {
              id: `protocol_error_${Date.now()}`,
              sessionId: sid,
              timestamp: new Date().toISOString(),
              provider,
              kind: 'error',
              content: String(msg.error || 'Request failed'),
            } as NormalizedMessage);
          }
          return;
        }

        case 'message_status': {
          // The server's answer to a sent message: its run started (`sent`),
          // or it waits for the run in progress to end (`queued`). A queued
          // message leaving the queue starts the session's next turn.
          if (!sid || typeof msg.clientMessageId !== 'string') return;
          // 5-oct: a tmux session stopped on a dialog got "Pensando…" for a
          // message the dialog swallowed. Now nothing is typed while a dialog
          // is open, and the echo says so instead of pretending a turn runs.
          const held = msg.status === 'queued' && msg.reason === 'tmux_prompt';
          const status = held ? 'held' : msg.status === 'queued' ? 'queued' : msg.status === 'sent' ? 'sent' : null;
          if (!status) return;
          sessionStore.setDeliveryState(sid, msg.clientMessageId, status);
          if (held) {
            onSessionIdle?.(sid);
          }
          // A tmux send is only `sent` once the pane took it, and that is
          // when its turn starts showing (the composer does not guess it).
          if (status === 'sent' && (msg.fromQueue === true || sessionStore.runsInTmux(sid))) {
            onSessionProcessing?.(sid, { statusText: null, canInterrupt: true });
          }
          return;
        }

        // Sidebar/global events — owned by useProjectsState.
        case 'session_upserted':
        case 'sidebar_archived':
        case 'loading_progress':
          return;

        // Questions a tmux pane is waiting on — owned by useTmuxPromptsFeed.
        case 'tmux_prompts':
        case 'tmux_prompt_error':
          return;

        default:
          break;
      }

      /* -------------------------------------------------------------- */
      /*  Provider NormalizedMessage handling                            */
      /* -------------------------------------------------------------- */

      // --- Block-start notice: pins the indicator before the block's first
      // token (Fase 5, paso 7). Only the main thread drives the floating
      // indicator; a subagent's own activity (`parentToolUseId` set) is the
      // Agent/Task card's concern (Fase 6), not handled here.
      if (msg.kind === 'activity') {
        if (sid && !msg.parentToolUseId) {
          const label = msg.activityKind === 'tool' && typeof msg.toolName === 'string' && msg.toolName
            ? msg.toolName
            : thinkingLabelRef.current;
          pinActivity(sid, label);
        }
        return;
      }

      // --- Streaming: buffer for performance ---
      // Every delta, viewed session or not, grows the session's single
      // streaming row; a delta is never stored as a message of its own.
      if (msg.kind === 'stream_delta') {
        const text = (msg.content as string) || '';
        if (!text || !sid) return;
        appendStreamDelta(streamBuffersRef.current, sid, text, provider, msg.messageId as string | undefined, msg.blockIndex as number | undefined, sessionStore);
        // Real answer text streaming in: the tool/thinking label yields to
        // the rotating words until a gap reopens it.
        clearActivityPin(sid);
        return;
      }

      if (msg.kind === 'thinking_delta') {
        const text = (msg.content as string) || '';
        if (!text || !sid) return;
        appendThinkingDelta(streamBuffersRef.current, sid, text, provider, msg.messageId as string | undefined, msg.blockIndex as number | undefined, sessionStore);
        // Thinking text is not the answer: keep "Pensando…" pinned while it streams.
        pinActivity(sid, thinkingLabelRef.current);
        return;
      }

      if (msg.kind === 'stream_end') {
        if (sid) {
          finalizeStreamBuffer(streamBuffersRef.current, sid, sessionStore);
        }
        return;
      }

      // --- All other messages: route to store ---
      const shouldPersist =
        msg.kind !== 'complete'
        && msg.kind !== 'status'
        && msg.kind !== 'permission_request'
        && msg.kind !== 'permission_resolved'
        && msg.kind !== 'permission_cancelled';

      if (sid && shouldPersist) {
        // The block's full message is here: the rows it streamed in as are
        // now redundant, however the stream closed (its own `stream_end`,
        // normally). Only *that* retires the open buffer — an unrelated event
        // interleaved mid-stream (a subagent's activity/text, a stderr-born
        // `error`, a tool call) must not, or one continuous block came apart
        // into a fragment, the full message and a leftover (00-linea-base;
        // Fase 5, paso 4).
        if (streamBuffersRef.current.has(sid) && msg.kind !== 'task_status') {
          const buffer = streamBuffersRef.current.get(sid);
          const isMainThreadFinalBlock = !msg.parentToolUseId && (
            (buffer?.kind === 'stream_delta' && msg.kind === 'text' && msg.role === 'assistant')
            || (buffer?.kind === 'thinking_delta' && msg.kind === 'thinking')
          );
          if (isMainThreadFinalBlock) {
            settleStreamBuffer(streamBuffersRef.current, sid, String(msg.content || ''));
          }
        }
        sessionStore.appendRealtime(sid, msg as unknown as NormalizedMessage);
      }

      // --- UI side effects for specific kinds ---
      switch (msg.kind) {
        case 'complete': {
          // Flush any remaining streaming state
          if (sid && streamBuffersRef.current.has(sid)) {
            finalizeStreamBuffer(streamBuffersRef.current, sid, sessionStore);
          }
          // The turn is over: a gap timer armed for it must not resurrect
          // "Pensando…" after the indicator itself is about to disappear.
          if (sid) {
            clearActivityGapTimer(sid);
          }

          // `complete` is the unified terminal event — every provider run ends
          // with exactly one, regardless of success, failure, or abort. The
          // indicator derives from the processing map, so the entry changes
          // immediately and atomically: a turn that ended with tasks still
          // running leaves the session as background work — the CLI is held
          // open for them — and any other leaves it idle. An abort releases
          // the CLI and takes that work down with it.
          if (sid && !msg.aborted) {
            reportRemainingBackgroundWork(sid);
          } else {
            onSessionIdle?.(sid);
          }
          if (sid === activeViewSessionId) {
            pendingPermissionRequestsRef.current = [];
            setPendingPermissionRequests([]);
            if (sid) onTurnComplete?.(sid);
          }

          if (msg.aborted) {
            // Abort was requested — the complete event confirms it. No
            // further UI action is needed beyond clearing the entry above.
            break;
          }

          // Celebrate only successful runs (failed runs end with success: false).
          if (msg.success !== false) {
            showCompletionTitleIndicator();
            void playChatCompletionSound();
          }

          // The session id is stable for the whole conversation (allocated
          // before the first send), so the only follow-up is syncing the
          // viewed conversation with the now-persisted transcript.
          if (sid && sid === activeViewSessionId) {
            void requestLatestMessages(sid, isActiveRef.current);
          }

          break;
        }

        // 'error' is an informational message row, not a terminal event —
        // providers emit it for mid-run stderr output too. Run teardown is
        // always signalled by the unified 'complete' that follows.

        case 'permission_request': {
          if (!msg.requestId) break;
          if (isActionablePermissionRequest({ toolName: msg.toolName })) {
            void playNotificationSound();
          }

          if (sid === activeViewSessionId) {
            const previousPendingPermissionRequests = pendingPermissionRequestsRef.current;
            if (!previousPendingPermissionRequests.some((request) => request.requestId === msg.requestId)) {
              const nextPendingPermissionRequests = [...previousPendingPermissionRequests, {
                requestId: msg.requestId as string,
                toolName: (msg.toolName as string) || 'UnknownTool',
                input: msg.input,
                context: msg.context,
                sessionId: sid || null,
                receivedAt: new Date(),
              }];

              pendingPermissionRequestsRef.current = nextPendingPermissionRequests;
              setPendingPermissionRequests(nextPendingPermissionRequests);
            }
          }
          if (sid) {
            onSessionProcessing?.(sid);
          }
          break;
        }

        // `permission_resolved` arrives when any client answers the prompt: it
        // retracts a replayed `permission_request` after a mid-run refresh and
        // clears the prompt in other tabs watching the same run.
        case 'permission_resolved':
        case 'permission_cancelled': {
          if (msg.requestId && sid === activeViewSessionId) {
            const nextPendingPermissionRequests = pendingPermissionRequestsRef.current.filter(
              (request: PendingPermissionRequest) => request.requestId !== msg.requestId,
            );

            pendingPermissionRequestsRef.current = nextPendingPermissionRequests;
            setPendingPermissionRequests(nextPendingPermissionRequests);
          }
          break;
        }

        case 'status': {
          if (msg.text === 'token_budget' && msg.tokenBudget) {
            // The counter shows the viewed session's context; budgets from
            // other concurrently running sessions must not overwrite it.
            if (sid === activeViewSessionId) {
              setTokenBudget(msg.tokenBudget as Record<string, unknown>);
            }
            // The sidebar's per-row compaction dot needs every session's
            // budget, not just the viewed one — published alongside the
            // filtered call above, which stays untouched.
            if (sid) {
              publishSessionBudget(sid, msg.tokenBudget as Record<string, unknown>);
            }
          } else if (msg.text && sid) {
            onSessionProcessing?.(sid, {
              statusText: msg.text as string,
              canInterrupt: msg.canInterrupt !== false,
            });
          }
          break;
        }

        case 'task_status': {
          // A task's notification, or the patch that killed it, can leave a
          // session that was only doing background work with nothing left
          // to do. A turn in flight is left alone: its `complete` reports.
          if (
            sid
            && (msg.event === 'notification' || msg.event === 'updated')
            && getSessionActivity?.(sid)?.background
          ) {
            reportRemainingBackgroundWork(sid);
          }
          // The notification carries only a summary; the task's actual result
          // is folded onto its card by the history reader, so a card that
          // just settled live shows it only after a sync — the same sync a
          // turn's `complete` triggers. Without it the result waited for a
          // manual reload.
          if (sid && sid === activeViewSessionId && msg.event === 'notification') {
            void requestLatestMessages(sid, isActiveRef.current);
          }
          break;
        }

        // text, tool_use, tool_result, thinking, task_notification
        // → already routed to store above, no UI side effects needed
        default:
          break;
      }
    };

    return subscribe(handleEvent);
  }, [
    subscribe,
    provider,
    selectedSession,
    currentSessionId,
    setTokenBudget,
    pendingPermissionRequests,
    setPendingPermissionRequests,
    streamBuffersRef,
    lastSeqRef,
    statusCheckSentAtRef,
    onSessionProcessing,
    onSessionIdle,
    onSessionBackground,
    getSessionActivity,
    onWebSocketReconnect,
    requestLatestMessages,
    sessionStore,
  ]);
}
