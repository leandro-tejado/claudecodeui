import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { describe, it } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * tmux has no deltas — the bridge only writes a message once it is complete —
 * so `isLiveText` is the one signal the chat pane has to tell a reply that
 * just arrived apart from one loaded from history. It gates the typewriter
 * reveal in MessageComponent the same way `isStreaming` gates it for the SDK
 * path's real streamed growth.
 */

const assistantText = (id: string, content: string): NormalizedMessage => ({
  id,
  kind: 'text',
  role: 'assistant',
  provider: 'claude',
  sessionId: 'session-1',
  content,
  timestamp: '2026-09-23T00:00:00.000Z',
} as NormalizedMessage);

describe('appendRealtime — isLiveText', () => {
  it('flags a live assistant reply in a tmux session', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.setRunsInTmux('session-1', true);
      result.current.appendRealtime('session-1', assistantText('m1', 'hola'));
    });

    const [message] = result.current.getMessages('session-1');
    assert.equal(message.isLiveText, true);
  });

  it('leaves an SDK-mode (non-tmux) session unflagged', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      // Never marked tmux — defaults to false, same as any session this
      // client has not heard a `chat_subscribed` ack for yet.
      result.current.appendRealtime('session-1', assistantText('m1', 'hola'));
    });

    const [message] = result.current.getMessages('session-1');
    assert.equal(message.isLiveText, undefined);
  });

  it('does not flag a user message even in a tmux session', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.setRunsInTmux('session-1', true);
      result.current.appendRealtime('session-1', {
        ...assistantText('m1', 'hola'),
        role: 'user',
      });
    });

    const [message] = result.current.getMessages('session-1');
    assert.equal(message.isLiveText, undefined);
  });
});
