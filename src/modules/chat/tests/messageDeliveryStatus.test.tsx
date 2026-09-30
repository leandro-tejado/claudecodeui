import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';
import type { NormalizedMessage, ProjectSession, ServerEvent } from '@/shared/types';

/*
 * Bug del 30-sep: un mensaje mandado mientras la sesión respondía no decía
 * nada — ni enviado, ni en cola — y volvía como error. El servidor ahora
 * contesta con `message_status`, y el eco del mensaje lo muestra.
 */

const SID = 'session-1';

function renderPane() {
  let emit: ((event: ServerEvent) => void) | null = null;
  const processing: string[] = [];
  const idle: string[] = [];

  const hook = renderHook(() => {
    const sessionStore = useSessionStore();
    useChatRealtimeHandlers({
      isActive: true,
      subscribe: (listener) => {
        emit = listener;
        return () => { emit = null; };
      },
      provider: 'claude',
      selectedSession: { id: SID } as ProjectSession,
      currentSessionId: SID,
      setTokenBudget: () => undefined,
      pendingPermissionRequests: [],
      setPendingPermissionRequests: () => undefined,
      streamBuffersRef: { current: new Map() },
      lastSeqRef: { current: new Map() },
      statusCheckSentAtRef: { current: new Map() },
      requestLatestMessages: async () => undefined,
      onSessionProcessing: (sessionId) => { processing.push(sessionId ?? ''); },
      onSessionIdle: (sessionId) => { idle.push(sessionId ?? ''); },
      sessionStore,
    });
    return sessionStore;
  });

  const echo = (id: string, content: string) => act(() => {
    hook.result.current.appendRealtime(SID, {
      id,
      sessionId: SID,
      timestamp: new Date().toISOString(),
      provider: 'claude',
      kind: 'text',
      role: 'user',
      content,
      deliveryState: 'sending',
    } as NormalizedMessage);
  });

  return {
    echo,
    processing,
    idle,
    emitEvent: (event: ServerEvent) => {
      assert.ok(emit, 'subscribe listener was never registered');
      act(() => { emit!(event); });
    },
    rendered: () => normalizedToChatMessages(hook.result.current.getMessages(SID))
      .map((message) => [message.type, String(message.content), message.deliveryState ?? null]),
  };
}

test('un mensaje en cola se ve "en cola", debajo de la respuesta que sigue llegando, y pasa a "enviado" al salir', () => {
  const pane = renderPane();
  pane.echo('local_1_a', 'primero');
  pane.emitEvent({ kind: 'message_status', sessionId: SID, clientMessageId: 'local_1_a', status: 'sent' } as ServerEvent);
  pane.echo('local_2_b', 'segundo');
  pane.emitEvent({ kind: 'message_status', sessionId: SID, clientMessageId: 'local_2_b', status: 'queued', position: 1 } as ServerEvent);
  // La respuesta al primero sigue llegando después de encolado el segundo.
  pane.emitEvent({ kind: 'text', role: 'assistant', id: 'a1', sessionId: SID, content: 'respuesta al primero', seq: 1 } as ServerEvent);

  assert.deepEqual(pane.rendered(), [
    ['user', 'primero', 'sent'],
    ['assistant', 'respuesta al primero', null],
    ['user', 'segundo', 'queued'],
  ]);

  pane.emitEvent({ kind: 'complete', sessionId: SID, success: true, seq: 2 } as ServerEvent);
  pane.emitEvent({
    kind: 'message_status', sessionId: SID, clientMessageId: 'local_2_b', status: 'sent', fromQueue: true,
  } as ServerEvent);

  assert.deepEqual(pane.rendered().at(-1), ['user', 'segundo', 'sent']);
  // Salir de la cola es el arranque del turno siguiente.
  assert.equal(pane.processing.at(-1), SID);
});

test('un rechazo porque ya hay una corrida no deja la sesión como ociosa, y marca el mensaje como no enviado', () => {
  const pane = renderPane();
  pane.echo('local_1_a', 'editado');
  pane.emitEvent({
    kind: 'protocol_error',
    code: 'RUN_IN_PROGRESS',
    error: 'Session "session-1" already has a run in progress.',
    sessionId: SID,
    clientMessageId: 'local_1_a',
  } as ServerEvent);

  assert.deepEqual(pane.idle, []);
  assert.deepEqual(pane.rendered()[0], ['user', 'editado', 'failed']);
});

test('un error sin id marca el eco más reciente que seguía "enviando"', () => {
  const pane = renderPane();
  pane.echo('local_1_a', 'viejo');
  pane.emitEvent({ kind: 'message_status', sessionId: SID, clientMessageId: 'local_1_a', status: 'sent' } as ServerEvent);
  pane.echo('local_2_b', 'nuevo');
  pane.emitEvent({ kind: 'protocol_error', code: 'TMUX_SEND_FAILED', error: 'pane gone', sessionId: SID } as ServerEvent);

  const states = pane.rendered().filter(([type]) => type === 'user').map(([, , state]) => state);
  assert.deepEqual(states, ['sent', 'failed']);
});
