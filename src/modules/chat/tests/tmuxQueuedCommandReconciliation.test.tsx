import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, it, vi } from 'vitest';

import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import type { NormalizedMessage } from '@/shared/types';

/**
 * Fase 7, paso 6: un mensaje mandado mientras el pane de tmux sigue en turno
 * entra a la cola propia de Claude Code. El puente lo lee del JSONL
 * (`attachment{type:"queued_command"}`) y lo manda en vivo como un mensaje de
 * usuario más, con un id sintético (`tmux_queued_<uuid>`) — nunca pasa por
 * `fetchHistory` (`tmux-bridge.service.ts`, paso 6: "un queued_command no
 * pasa por fetchHistory"). Cuando Claude lo despacha, el turno real que
 * contesta ese mensaje sí queda en el historial, con su propio uuid — distinto
 * del sintético. Sin reconciliar esa fila en vivo contra el historial real,
 * queda ahí para siempre: el mensaje se termina viendo dos veces.
 */

const sessionMessages = vi.fn();

vi.mock('@/shared/api', () => ({
  api: {
    providers: {
      sessionMessages: (...args: unknown[]) => sessionMessages(...args),
    },
  },
}));

const SID = 'session-1';

const queuedCommandRow = (uuid: string, content: string, second: number): NormalizedMessage => ({
  id: `tmux_queued_${uuid}`,
  transcriptAnchorId: uuid,
  sessionId: SID,
  provider: 'claude',
  timestamp: `2026-01-01T00:00:0${second}.000Z`,
  kind: 'text',
  role: 'user',
  content,
} as NormalizedMessage);

const persistedTurn = (uuid: string, content: string, second: number): NormalizedMessage => ({
  id: uuid,
  sessionId: SID,
  provider: 'claude',
  timestamp: `2026-01-01T00:00:0${second}.000Z`,
  kind: 'text',
  role: 'user',
  content,
} as NormalizedMessage);

const userTexts = (messages: NormalizedMessage[]) =>
  messages.filter((message) => message.kind === 'text' && message.role === 'user').map((message) => message.content);

beforeEach(() => {
  sessionMessages.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

it('la fila en vivo de un queued_command se retira cuando el turno real que contestó queda en el historial', async () => {
  const { useSessionStore } = await import('@/modules/chat/hooks/useSessionStore');
  const { result } = renderHook(() => useSessionStore());

  act(() => {
    result.current.setRunsInTmux(SID, true);
    result.current.appendRealtime(SID, queuedCommandRow('uuid-queued-1', 'contá hasta 3', 1));
  });
  // Solo en vivo: una fila, visible de inmediato ("Enviado").
  assert.deepEqual(userTexts(result.current.getMessages(SID)), ['contá hasta 3']);

  // El turno real que lo contestó ya está en el historial, con su propio uuid.
  sessionMessages.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        messages: [persistedTurn('uuid-real-1', 'contá hasta 3', 2)],
        total: 1,
        hasMore: false,
      },
    }),
  });
  await act(async () => {
    await result.current.fetchFromServer(SID, { limit: 20, offset: 0 });
  });

  // Una sola fila: la del historial real, no la placeholder en vivo.
  assert.deepEqual(userTexts(result.current.getMessages(SID)), ['contá hasta 3']);
  assert.deepEqual(
    result.current.getMessages(SID).filter((message) => message.kind === 'text' && message.role === 'user').map((message) => message.id),
    ['uuid-real-1'],
  );
});

it('dos queued_command seguidos con el mismo texto no se retiran entre sí', async () => {
  const { useSessionStore } = await import('@/modules/chat/hooks/useSessionStore');
  const { result } = renderHook(() => useSessionStore());

  act(() => {
    result.current.setRunsInTmux(SID, true);
    result.current.appendRealtime(SID, queuedCommandRow('uuid-queued-1', 'ok', 1));
    result.current.appendRealtime(SID, queuedCommandRow('uuid-queued-2', 'ok', 2));
  });

  // Sin historial real todavía: las dos siguen, cada una representa un envío distinto.
  assert.equal(userTexts(result.current.getMessages(SID)).length, 2);
});
