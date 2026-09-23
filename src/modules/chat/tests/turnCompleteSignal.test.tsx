import assert from 'node:assert/strict';

import { renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import type { ProjectSession, ServerEvent } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * `onTurnComplete` is the Salidas panel's only refresh signal besides its own
 * button (PanelSalidas.tsx): it has to fire exactly on the viewed session's
 * `complete`, success or not, and never for a session sitting in the
 * background — a background run's outputs are not what is on screen.
 */

function createSessionStoreStub(): SessionStore {
  const noop = () => undefined;
  return {
    truncateAt: noop,
    setRunsInTmux: noop,
    appendRealtime: noop,
    updateStreaming: noop,
    finalizeStreaming: noop,
    runsInTmux: () => false,
    getMessages: () => [],
    getSessionSlot: () => undefined,
  } as unknown as SessionStore;
}

function renderHandlers(overrides: { selectedSessionId: string; onTurnComplete: (sessionId: string) => void }) {
  let emit: ((event: ServerEvent) => void) | null = null;

  renderHook(() => useChatRealtimeHandlers({
    isActive: true,
    subscribe: (listener) => {
      emit = listener;
      return () => { emit = null; };
    },
    provider: 'claude',
    selectedSession: { id: overrides.selectedSessionId } as ProjectSession,
    currentSessionId: overrides.selectedSessionId,
    setTokenBudget: () => undefined,
    pendingPermissionRequests: [],
    setPendingPermissionRequests: () => undefined,
    streamTimerRef: { current: null },
    accumulatedStreamRef: { current: '' },
    lastSeqRef: { current: new Map() },
    statusCheckSentAtRef: { current: new Map() },
    requestLatestMessages: async () => undefined,
    sessionStore: createSessionStoreStub(),
    onTurnComplete: overrides.onTurnComplete,
  }));

  return {
    emitEvent: (event: ServerEvent) => {
      assert.ok(emit, 'subscribe listener was never registered');
      emit!(event);
    },
  };
}

test('onTurnComplete fires for the viewed session on a successful complete', () => {
  const completedFor: string[] = [];
  const { emitEvent } = renderHandlers({
    selectedSessionId: 's1',
    onTurnComplete: (sessionId) => completedFor.push(sessionId),
  });

  emitEvent({ kind: 'complete', sessionId: 's1', success: true } as ServerEvent);

  assert.deepEqual(completedFor, ['s1']);
});

test('onTurnComplete fires even when the turn was aborted', () => {
  const completedFor: string[] = [];
  const { emitEvent } = renderHandlers({
    selectedSessionId: 's1',
    onTurnComplete: (sessionId) => completedFor.push(sessionId),
  });

  emitEvent({ kind: 'complete', sessionId: 's1', aborted: true } as ServerEvent);

  assert.deepEqual(completedFor, ['s1']);
});

test('onTurnComplete does not fire for a session other than the one being viewed', () => {
  const completedFor: string[] = [];
  const { emitEvent } = renderHandlers({
    selectedSessionId: 's1',
    onTurnComplete: (sessionId) => completedFor.push(sessionId),
  });

  emitEvent({ kind: 'complete', sessionId: 's2', success: true } as ServerEvent);

  assert.deepEqual(completedFor, []);
});
