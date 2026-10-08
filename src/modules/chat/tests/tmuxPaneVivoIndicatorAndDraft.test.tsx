import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { useSessionStore } from '@/modules/chat/hooks/useSessionStore';
import type { ProjectSession, ServerEvent } from '@/shared/types';

/**
 * Fase 7, paso 8: la sesión de tmux muestra el indicador y el borrador con
 * los mismos componentes que headless (Fase 5) — `tmux-pane-vivo.service.ts`
 * emite `activity` (thinking/tool/idle), `stream_delta` con el borrador
 * entero (`tmux-borrador:<sesión>`, el cliente REEMPLAZA, no concatena) y
 * `stream_reemplazo` (borra el borrador, la fila definitiva llega aparte,
 * por su cuenta, como un mensaje común del JSONL).
 */

const SID = 'session-1';

function renderPane() {
  let emit: ((event: ServerEvent) => void) | null = null;
  const processingCalls: Array<{ sessionId: string; statusText?: string | null }> = [];

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
      onSessionProcessing: (sessionId, activity) => {
        processingCalls.push({ sessionId: sessionId ?? '', statusText: activity?.statusText });
      },
      onSessionIdle: () => undefined,
      sessionStore,
    });
    return sessionStore;
  });

  return {
    processingCalls,
    emitEvent: (event: ServerEvent) => {
      assert.ok(emit, 'subscribe listener was never registered');
      act(() => { emit!(event); });
    },
    // The streaming row is flushed to the store on a 100ms throttle
    // (`STREAM_FLUSH_MS`, `streamBuffers.ts`), not synchronously.
    wait: (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }),
    rendered: () => normalizedToChatMessages(hook.result.current.getMessages(SID))
      .map((message) => [message.type, String(message.content)]),
  };
}

test('un "activity" idle del pane no pisa el indicador con "Pensando…"', () => {
  const pane = renderPane();

  pane.emitEvent({ kind: 'activity', sessionId: SID, activityKind: undefined, idle: true } as ServerEvent);

  assert.deepEqual(pane.processingCalls, [], 'idle no pide pintar ningún label');
});

test('un "activity" de thinking sigue pintando el indicador (idle no rompe el resto)', () => {
  const pane = renderPane();

  pane.emitEvent({ kind: 'activity', sessionId: SID, activityKind: 'thinking' } as ServerEvent);

  assert.equal(pane.processingCalls.length, 1);
  assert.equal(pane.processingCalls[0]?.sessionId, SID);
});

test('el borrador del pane se reemplaza, no se concatena', async () => {
  const pane = renderPane();

  pane.emitEvent({
    kind: 'stream_delta', sessionId: SID, messageId: `tmux-borrador:${SID}`, blockIndex: 0, content: 'Hola',
  } as ServerEvent);
  await pane.wait(150);
  pane.emitEvent({
    kind: 'stream_delta', sessionId: SID, messageId: `tmux-borrador:${SID}`, blockIndex: 0, content: 'Hola, ¿cómo va?',
  } as ServerEvent);
  await pane.wait(150);

  const texts = pane.rendered().filter(([type]) => type === 'assistant').map(([, content]) => content);
  assert.deepEqual(texts, ['Hola, ¿cómo va?'], 'una sola fila, con el texto reemplazado, no "HolaHola, ¿cómo va?"');
});

test('"stream_reemplazo" borra el borrador sin dejar una fila huérfana', async () => {
  const pane = renderPane();

  pane.emitEvent({
    kind: 'stream_delta', sessionId: SID, messageId: `tmux-borrador:${SID}`, blockIndex: 0, content: 'texto a mitad',
  } as ServerEvent);
  await pane.wait(150);
  assert.equal(pane.rendered().filter(([type]) => type === 'assistant').length, 1, 'el borrador se ve mientras llega');

  pane.emitEvent({
    kind: 'stream_reemplazo', sessionId: SID, messageId: `tmux-borrador:${SID}`, blockIndex: 0,
  } as ServerEvent);

  assert.equal(pane.rendered().filter(([type]) => type === 'assistant').length, 0, 'el borrador desaparece: la fila definitiva la manda el JSONL aparte');

  // La fila definitiva llega como un mensaje común (el bridge ya la manda así).
  pane.emitEvent({
    kind: 'text', role: 'assistant', id: 'uuid-real', sessionId: SID, content: 'texto a mitad, completo',
  } as ServerEvent);
  assert.deepEqual(
    pane.rendered().filter(([type]) => type === 'assistant'),
    [['assistant', 'texto a mitad, completo']],
    'una sola fila final, no dos',
  );
});

/*
 * 8-oct: regresión de `pregunta/tmux-multi` (e2e, ver
 * `e2e/evidencia/final-3901/pregunta-tmux-multi/frames-0.json`). El orden que
 * se vio en esa corrida no fue el del test de arriba: el `text` real (con su
 * propio `messageId`/`blockIndex` de Claude, no el sintético del borrador) y
 * el `complete` llegaron ANTES que el `stream_reemplazo` — el poll de 400ms
 * del pane se atrasó respecto del `.jsonl`. `complete` dispara
 * `finalizeStreamBuffer`, que antes del fix dejaba la fila del borrador
 * intacta (la rama "ya viene a reemplazarla" de `finalizeStreaming`, pensada
 * para la identidad real de Claude, también se aplicaba por error a la
 * sintética `tmux-borrador:`) y encima borraba el buffer — así que cuando el
 * `stream_reemplazo` llegaba después, ya no encontraba nada que descartar.
 * El borrador sucio quedaba para siempre, al lado de la fila limpia.
 */
test('"complete" antes que "stream_reemplazo" (el poll del pane se atrasa) igual descarta el borrador', async () => {
  const pane = renderPane();

  pane.emitEvent({
    kind: 'stream_delta',
    sessionId: SID,
    messageId: `tmux-borrador:${SID}`,
    blockIndex: 0,
    content: 'texto crudo del pane, con el eco del prompt y la statusline',
  } as ServerEvent);
  await pane.wait(150);
  assert.equal(pane.rendered().filter(([type]) => type === 'assistant').length, 1, 'el borrador se ve mientras llega');

  // La fila definitiva — con su propio messageId/blockIndex de Claude, nunca
  // el sintético del borrador — llega antes del stream_reemplazo.
  pane.emitEvent({
    kind: 'text',
    role: 'assistant',
    id: 'uuid-real',
    sessionId: SID,
    content: 'COLORES Rojo, Azul, Negro',
    messageId: 'msg_real_de_claude',
    blockIndex: 0,
  } as ServerEvent);

  pane.emitEvent({ kind: 'complete', sessionId: SID, success: true } as ServerEvent);

  // Recién ahora llega el stream_reemplazo, tarde — no debe hacer falta para
  // limpiar el borrador: "complete" ya tuvo que descartarlo.
  pane.emitEvent({
    kind: 'stream_reemplazo', sessionId: SID, messageId: `tmux-borrador:${SID}`, blockIndex: 0,
  } as ServerEvent);

  assert.deepEqual(
    pane.rendered().filter(([type]) => type === 'assistant'),
    [['assistant', 'COLORES Rojo, Azul, Negro']],
    'una sola fila final y limpia, no el borrador sucio al lado',
  );
});
