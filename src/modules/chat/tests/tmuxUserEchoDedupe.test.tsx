import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { describe, it } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * 30-sep, Leandro: "cuando mando un mensaje primero aparece duplicado y
 * después se arregla". En una sesión de tmux la fila del usuario no llega
 * con el historial sino en vivo: el puente la lee del transcript apenas
 * `claude` la escribe y la manda por el socket. El eco optimista (`local_…`)
 * solo se retiraba contra el historial del servidor, así que las dos quedaban
 * a la vista hasta el refresco del fin de turno.
 */

const at = (offsetMs: number) => new Date(Date.parse('2026-09-30T18:00:00.000Z') + offsetMs).toISOString();

const userRow = (id: string, content: string, timestamp: string, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
  id,
  kind: 'text',
  role: 'user',
  provider: 'claude',
  sessionId: 'session-1',
  content,
  timestamp,
  ...extra,
} as NormalizedMessage);

const userTexts = (messages: NormalizedMessage[]) =>
  messages.filter((message) => message.kind === 'text' && message.role === 'user').map((message) => message.id);

describe('eco optimista en una sesión de tmux', () => {
  it('la fila del usuario que llega en vivo retira el eco: el mensaje se ve una sola vez', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.setRunsInTmux('session-1', true);
      result.current.appendRealtime('session-1', userRow('local_1', 'hola', at(0), { deliveryState: 'sent' }));
    });
    assert.deepEqual(userTexts(result.current.getMessages('session-1')), ['local_1']);

    act(() => {
      result.current.appendRealtime('session-1', userRow('uuid-1', 'hola', at(900)));
    });
    assert.deepEqual(userTexts(result.current.getMessages('session-1')), ['uuid-1']);
  });

  it('dos mensajes iguales seguidos: cada fila en vivo retira un solo eco', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.appendRealtime('session-1', userRow('local_1', 'sí', at(0)));
      result.current.appendRealtime('session-1', userRow('local_2', 'sí', at(1000)));
      result.current.appendRealtime('session-1', userRow('uuid-1', 'sí', at(1200)));
    });

    assert.equal(userTexts(result.current.getMessages('session-1')).length, 2);
  });
});
