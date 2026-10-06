import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { describe, it } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';
import { streamRowId } from '@/modules/chat/utils/streamRowId';
import { getIntrinsicMessageKey } from '@/modules/chat/utils/messageKeys';

/**
 * Fase 5, paso 1/2/3: a Claude block's streaming row and the final
 * `text`/`thinking` row that closes it share the same `(messageId,
 * blockIndex)` pair (protocolo-streaming.md). This replaces the old
 * text-matching dedupe helpers and their tests (Fase 5, paso 5 — the trio
 * that used to drop a stream fragment or an echo of the full text by
 * comparing content): the row is kept or replaced by id, never by comparing
 * content.
 */

const SID = 'session-1';
const MESSAGE_ID = 'msg_abc';
const BLOCK_INDEX = 0;

describe('identidad de bloque (messageId, blockIndex)', () => {
  it('un `text` final con el mismo (messageId, blockIndex) reemplaza la fila en streaming, no agrega una nueva', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.updateStreaming(SID, 'Hola, ', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      });
    });

    assert.equal(result.current.getMessages(SID).length, 1);
    const [streamingRow] = result.current.getMessages(SID);
    assert.equal(streamingRow.id, streamRowId(SID, MESSAGE_ID, BLOCK_INDEX));

    act(() => {
      result.current.appendRealtime(SID, {
        id: 'uuid-transcript-row',
        kind: 'text',
        role: 'assistant',
        provider: 'claude',
        sessionId: SID,
        content: 'Hola, mundo.',
        timestamp: '2026-10-06T00:00:00.000Z',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      } as NormalizedMessage);
    });

    const rows = result.current.getMessages(SID);
    assert.equal(rows.length, 1, 'el text final no debe agregar una segunda fila');
    assert.equal(rows[0].id, streamRowId(SID, MESSAGE_ID, BLOCK_INDEX));
    assert.equal(rows[0].content, 'Hola, mundo.');
    assert.equal(rows[0].kind, 'text');
  });

  it('un `thinking` final con la misma identidad reemplaza su fila, no la duplica', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.updateStreaming(SID, 'Pensando un poco', 'claude', {
        kind: 'thinking_delta',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      });
    });

    act(() => {
      result.current.appendRealtime(SID, {
        id: 'uuid-thinking-row',
        kind: 'thinking',
        role: 'assistant',
        provider: 'claude',
        sessionId: SID,
        content: 'Pensando un poco más.',
        timestamp: '2026-10-06T00:00:00.000Z',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      } as NormalizedMessage);
    });

    const rows = result.current.getMessages(SID);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].content, 'Pensando un poco más.');
    assert.equal(rows[0].kind, 'thinking');
  });

  it('un bloque distinto (otro blockIndex) del mismo mensaje es una fila propia', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.updateStreaming(SID, 'Primer bloque', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: 0,
      });
      result.current.updateStreaming(SID, 'Segundo bloque', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: 1,
      });
    });

    const rows = result.current.getMessages(SID);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, streamRowId(SID, MESSAGE_ID, 0));
    assert.equal(rows[1].id, streamRowId(SID, MESSAGE_ID, 1));
  });

  it('updateStreaming no toca el timestamp: el de la primera entrega sobrevive a cada flush', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.updateStreaming(SID, 'a', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      });
    });
    const firstTimestamp = result.current.getMessages(SID)[0].timestamp;

    act(() => {
      result.current.updateStreaming(SID, 'ab', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      });
      result.current.updateStreaming(SID, 'abc', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      });
    });

    const row = result.current.getMessages(SID)[0];
    assert.equal(row.content, 'abc');
    assert.equal(row.timestamp, firstTimestamp);
  });

  it('finalizeStreaming con identidad no renombra ni toca la fila: queda para que el text final la reemplace', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.updateStreaming(SID, 'texto parcial', 'claude', {
        kind: 'stream_delta',
        messageId: MESSAGE_ID,
        blockIndex: BLOCK_INDEX,
      });
      result.current.finalizeStreaming(SID, { messageId: MESSAGE_ID, blockIndex: BLOCK_INDEX });
    });

    const rows = result.current.getMessages(SID);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, streamRowId(SID, MESSAGE_ID, BLOCK_INDEX));
    assert.equal(rows[0].kind, 'stream_delta');
  });
});

describe('messageKeys — identidad por id', () => {
  it('con id presente, la key se deriva del id, no del timestamp ni del contenido', () => {
    const keyA = getIntrinsicMessageKey({
      type: 'assistant',
      id: streamRowId(SID, MESSAGE_ID, BLOCK_INDEX),
      content: 'contenido parcial',
      timestamp: '2026-10-06T00:00:00.000Z',
    });
    const keyB = getIntrinsicMessageKey({
      type: 'assistant',
      id: streamRowId(SID, MESSAGE_ID, BLOCK_INDEX),
      // Same id, different content/timestamp (a later flush of the same
      // row): the key must not change, or the row remounts on every tick.
      content: 'contenido final, mucho más largo que el parcial',
      timestamp: '2026-10-06T00:00:05.000Z',
    });

    assert.ok(keyA);
    assert.equal(keyA, keyB);
  });
});
