import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';
import type { StreamBuffers } from '@/modules/chat/utils/streamBuffers';
import type { ProjectSession, ServerEvent } from '@/shared/types';

/**
 * Bug del 30-sep (sesión 56261920): mientras el orquestador respondía,
 * Leandro estaba mirando otra sesión. Al volver, la respuesta estaba partida
 * en un mensaje por delta —"Ya enc", "ontré d", …, cada uno con su botón
 * MD— y después, otra vez, el mensaje entero. Tiene que haber un solo
 * mensaje que crece.
 */

function renderPane(viewedSessionId: string) {
  let emit: ((event: ServerEvent) => void) | null = null;
  const streamBuffersRef: { current: StreamBuffers } = { current: new Map() };

  const hook = renderHook(() => {
    const sessionStore = useSessionStore();
    useChatRealtimeHandlers({
      isActive: true,
      subscribe: (listener) => {
        emit = listener;
        return () => { emit = null; };
      },
      provider: 'claude',
      selectedSession: { id: viewedSessionId } as ProjectSession,
      currentSessionId: viewedSessionId,
      setTokenBudget: () => undefined,
      pendingPermissionRequests: [],
      setPendingPermissionRequests: () => undefined,
      streamBuffersRef,
      lastSeqRef: { current: new Map() },
      statusCheckSentAtRef: { current: new Map() },
      requestLatestMessages: async () => undefined,
      sessionStore,
    });
    return sessionStore;
  });

  return {
    emitEvent: (event: ServerEvent) => {
      assert.ok(emit, 'subscribe listener was never registered');
      act(() => { emit!(event); });
    },
    assistantTexts: (sessionId: string) => normalizedToChatMessages(hook.result.current.getMessages(sessionId))
      .filter((message) => message.type === 'assistant')
      .map((message) => String(message.content)),
  };
}

const DELTAS = ['Ya enc', 'ontré d', 'ónde est', 'á el problema.'];
const FULL = DELTAS.join('');

function streamTurn(emitEvent: (event: ServerEvent) => void, sessionId: string, deltas = DELTAS) {
  let seq = 0;
  for (const content of deltas) {
    emitEvent({ kind: 'stream_delta', sessionId, content, seq: ++seq } as ServerEvent);
  }
  emitEvent({ kind: 'stream_end', sessionId, seq: ++seq } as ServerEvent);
  emitEvent({
    kind: 'text', role: 'assistant', id: `msg_${sessionId}`, sessionId, content: deltas.join(''), seq: ++seq,
  } as ServerEvent);
  emitEvent({ kind: 'complete', sessionId, success: true, seq: ++seq } as ServerEvent);
}

test('una respuesta que llega mientras se mira otra sesión queda como un solo mensaje, sin fragmentos ni duplicado', () => {
  const pane = renderPane('otra-sesion');

  streamTurn(pane.emitEvent, 'orquestador');

  assert.deepEqual(pane.assistantTexts('orquestador'), [FULL]);
  assert.deepEqual(pane.assistantTexts('otra-sesion'), []);
});

test('antes de terminar, la sesión fuera de vista tiene un único mensaje que crece', async () => {
  const pane = renderPane('otra-sesion');

  pane.emitEvent({ kind: 'stream_delta', sessionId: 'orquestador', content: 'Ya enc', seq: 1 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_delta', sessionId: 'orquestador', content: 'ontré d', seq: 2 } as ServerEvent);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
  assert.deepEqual(pane.assistantTexts('orquestador'), ['Ya encontré d']);

  pane.emitEvent({ kind: 'stream_delta', sessionId: 'orquestador', content: 'ónde está el problema.', seq: 3 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_end', sessionId: 'orquestador', seq: 4 } as ServerEvent);
  assert.deepEqual(pane.assistantTexts('orquestador'), [FULL]);
});

test('dos sesiones que transmiten a la vez no mezclan sus textos', () => {
  const pane = renderPane('a');

  pane.emitEvent({ kind: 'stream_delta', sessionId: 'a', content: 'Hola ', seq: 1 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_delta', sessionId: 'b', content: 'Chau ', seq: 1 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_delta', sessionId: 'a', content: 'desde A', seq: 2 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_delta', sessionId: 'b', content: 'desde B', seq: 2 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_end', sessionId: 'a', seq: 3 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_end', sessionId: 'b', seq: 3 } as ServerEvent);

  assert.deepEqual(pane.assistantTexts('a'), ['Hola desde A']);
  assert.deepEqual(pane.assistantTexts('b'), ['Chau desde B']);
});
