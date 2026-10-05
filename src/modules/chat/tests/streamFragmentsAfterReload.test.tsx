import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, it, vi } from 'vitest';

import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import type { NormalizedMessage } from '@/shared/types';

/**
 * Una respuesta cortada a mitad de palabra no puede sobrevivir al historial:
 * cuando el server devuelve la respuesta entera, los fragmentos que armó el
 * cliente con el stream se retiran y queda un solo mensaje.
 */

const sessionMessages = vi.fn();

vi.mock('@/shared/api', () => ({
  api: {
    providers: {
      sessionMessages: (...args: unknown[]) => sessionMessages(...args),
    },
  },
}));

const FULL = 'Lo que importa es el **tamaño del contexto**, no la sesión.';

const server = (id: string, role: 'user' | 'assistant', content: string, second: number): NormalizedMessage => ({
  id,
  kind: 'text',
  role,
  provider: 'claude',
  sessionId: 'session-1',
  content,
  timestamp: `2026-01-01T00:00:0${second}.000Z`,
  ...(role === 'user' ? { transcriptAnchorId: id } : {}),
} as NormalizedMessage);

const HISTORY = [server('u1', 'user', 'pregunta', 1), server('a1', 'assistant', FULL, 2)];

beforeEach(() => {
  sessionMessages.mockReset();
  sessionMessages.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { messages: HISTORY, total: HISTORY.length, hasMore: false } }),
  });
});

afterEach(() => {
  vi.resetModules();
});

const fragment = (id: string, kind: 'text' | 'stream_delta', content: string, second: number): NormalizedMessage => ({
  id,
  kind,
  ...(kind === 'text' ? { role: 'assistant' } : {}),
  provider: 'claude',
  sessionId: 'session-1',
  content,
  timestamp: `2026-01-01T00:00:0${second}.500Z`,
} as NormalizedMessage);

it('tras traer el historial, los fragmentos del stream no quedan junto a la respuesta entera', async () => {
  const { useSessionStore } = await import('@/modules/chat/hooks/useSessionStore');
  const { result } = renderHook(() => useSessionStore());

  act(() => {
    result.current.appendRealtime('session-1', fragment('text_1_abc', 'text', 'Lo que importa es el **t', 2));
    result.current.appendRealtime('session-1', fragment('__streaming_session-1', 'stream_delta', 'amaño del contexto**, no la sesión.', 3));
  });
  await act(async () => {
    await result.current.fetchFromServer('session-1', { limit: 20, offset: 0 });
  });

  const texts = normalizedToChatMessages(result.current.getMessages('session-1'))
    .filter((message) => message.type === 'assistant')
    .map((message) => String(message.content));
  assert.deepEqual(texts, [FULL]);
});
