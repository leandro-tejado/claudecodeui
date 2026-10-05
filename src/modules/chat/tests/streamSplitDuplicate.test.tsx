import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';
import type { StreamBuffers } from '@/modules/chat/utils/streamBuffers';
import type { ProjectSession, ServerEvent } from '@/shared/types';

function renderPane(viewedSessionId: string) {
  let emit: ((event: ServerEvent) => void) | null = null;
  const streamBuffersRef: { current: StreamBuffers } = { current: new Map() };
  const hook = renderHook(() => {
    const sessionStore = useSessionStore();
    useChatRealtimeHandlers({
      isActive: true,
      subscribe: (listener) => { emit = listener; return () => { emit = null; }; },
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
      assert.ok(emit);
      act(() => { emit!(event); });
    },
    wait: (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); }),
    assistantTexts: (sid: string) => normalizedToChatMessages(hook.result.current.getMessages(sid))
      .filter((m) => m.type === 'assistant')
      .map((m) => String(m.content)),
  };
}

const SID = 's1';
const FULL = 'Lo que importa es el **tamaño del contexto**, no la sesión.';

test('un evento que no es texto en medio del stream no parte la respuesta', async () => {
  const pane = renderPane(SID);
  pane.emitEvent({ kind: 'stream_delta', sessionId: SID, content: 'Lo que importa es el **t', seq: 1 } as ServerEvent);
  await pane.wait(150);
  pane.emitEvent({ kind: 'task_status', sessionId: SID, event: 'progress', taskId: 't1', seq: 2 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_delta', sessionId: SID, content: 'amaño del contexto**, no la sesión.', seq: 3 } as ServerEvent);
  pane.emitEvent({ kind: 'text', role: 'assistant', id: 'uuid-1', sessionId: SID, content: FULL, seq: 4 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_end', sessionId: SID, seq: 5 } as ServerEvent);
  assert.deepEqual(pane.assistantTexts(SID), [FULL]);
});

test('el mensaje final que llega antes del último tramo no deja un resto suelto', async () => {
  const pane = renderPane(SID);
  pane.emitEvent({ kind: 'stream_delta', sessionId: SID, content: 'Lo que importa es el **t', seq: 1 } as ServerEvent);
  await pane.wait(150);
  pane.emitEvent({ kind: 'text', role: 'assistant', id: 'uuid-1', sessionId: SID, content: FULL, seq: 2 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_delta', sessionId: SID, content: 'amaño del contexto**, no la sesión.', seq: 3 } as ServerEvent);
  pane.emitEvent({ kind: 'stream_end', sessionId: SID, seq: 4 } as ServerEvent);
  await pane.wait(150);
  assert.deepEqual(pane.assistantTexts(SID), [FULL]);
});

test('el replay de una respuesta ya recibida no la duplica', async () => {
  const pane = renderPane(SID);
  const events = [
    { kind: 'stream_delta', sessionId: SID, content: 'Lo que importa es el **t', seq: 1 },
    { kind: 'stream_delta', sessionId: SID, content: 'amaño del contexto**, no la sesión.', seq: 2 },
    { kind: 'text', role: 'assistant', id: 'uuid-1', sessionId: SID, content: FULL, seq: 3 },
    { kind: 'stream_end', sessionId: SID, seq: 4 },
  ] as ServerEvent[];
  events.forEach((e) => pane.emitEvent(e));
  await pane.wait(150);
  // reconexión con un lastSeq viejo: el server reenvía desde el principio
  events.forEach((e) => pane.emitEvent(e));
  await pane.wait(150);
  assert.deepEqual(pane.assistantTexts(SID), [FULL]);
});
