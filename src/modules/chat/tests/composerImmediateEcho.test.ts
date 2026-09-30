import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';
import type { ChatMessage, PermissionMode, Project, ProjectSession } from '@/shared/types';

/*
 * Bug del 30-sep: con una imagen adjunta, el mensaje no aparecía, el input no
 * se limpiaba y el botón no cambiaba hasta que terminaba de subirse. Leandro
 * apretó enviar tres veces: cada clic arrancó otro envío completo, y los que
 * cayeron sobre el botón ya convertido en Stop abortaron la corrida.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };
const SESSION: ProjectSession = { id: 'session-1' };
const UPLOADED = { name: 'captura.png', path: 'abc.png', mimeType: 'image/png' };

let finishUpload: ((ok: boolean) => void) | null = null;

function renderComposer() {
  const sent: Array<Record<string, unknown>> = [];
  const added: ChatMessage[] = [];
  const deliveryUpdates: Array<{ id: string; state: string; patch?: Record<string, unknown> }> = [];
  const processing: string[] = [];
  const idle: string[] = [];
  const view = renderHook(() =>
    useChatComposerState({
      selectedProject: PROJECT,
      selectedSession: SESSION,
      currentSessionId: SESSION.id,
      provider: 'claude',
      permissionMode: 'default',
      cyclePermissionMode: () => undefined,
      resolvePermissionModeForProvider: () => 'default' as PermissionMode,
      currentProviderModel: 'test-model',
      currentProviderEffort: 'medium',
      isLoading: false,
      processingSessions: new Map(),
      canAbortSession: false,
      tokenBudget: null,
      sendMessage: (message) => { sent.push(message as Record<string, unknown>); },
      scrollToBottom: () => undefined,
      addMessage: (message) => { added.push(message); },
      setIsUserScrolledUp: () => undefined,
      setPendingPermissionRequests: () => undefined,
      onSessionProcessing: (sessionId) => { processing.push(sessionId ?? ''); },
      onSessionIdle: (sessionId) => { idle.push(sessionId ?? ''); },
      sessionStore: {
        setRunsInTmux: () => undefined,
        runsInTmux: () => false,
        setDeliveryState: (_sessionId: string, id: string, state: string, patch?: Record<string, unknown>) => {
          deliveryUpdates.push({ id, state, patch });
          return true;
        },
      } as unknown as SessionStore,
    }),
  );
  return { view, sent, added, deliveryUpdates, processing, idle };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/assets')) {
      const ok = await new Promise<boolean>((resolve) => { finishUpload = resolve; });
      return ok
        ? new Response(JSON.stringify({ attachments: [UPLOADED] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ error: 'disk full' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  localStorage.clear();
});

afterEach(() => {
  finishUpload = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const submitEvent = { preventDefault: () => undefined } as never;

test('el mensaje aparece como "enviando" y el input se limpia antes de que termine de subir el adjunto', async () => {
  const { view, sent, added, processing } = renderComposer();
  await act(async () => {
    view.result.current.setInput('no me aparece la sesion');
    view.result.current.setAttachedFiles([new File(['x'], 'captura.png', { type: 'image/png' })]);
  });

  let pending: Promise<void> | undefined;
  await act(async () => { pending = view.result.current.handleSubmit(submitEvent); });

  // Todavía subiendo.
  assert.equal(sent.length, 0);
  assert.equal(added.length, 1);
  assert.equal(added[0].content, 'no me aparece la sesion');
  assert.equal(added[0].deliveryState, 'sending');
  assert.match(String(added[0].clientMessageId), /^local_/);
  assert.deepEqual(processing, ['session-1']);
  assert.equal(view.result.current.input, '');
  assert.equal(view.result.current.attachedFiles.length, 0);
  assert.equal(view.result.current.isSubmitting, true);

  await act(async () => {
    finishUpload?.(true);
    await pending;
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'chat.send');
  assert.equal(sent[0].clientMessageId, added[0].clientMessageId);
  assert.deepEqual((sent[0].options as { attachments: unknown[] }).attachments, [UPLOADED]);
});

test('más clics mientras sube no mandan el mensaje otra vez', async () => {
  const { view, sent, added } = renderComposer();
  await act(async () => {
    view.result.current.setInput('una vez');
    view.result.current.setAttachedFiles([new File(['x'], 'captura.png', { type: 'image/png' })]);
  });

  let pending: Promise<void> | undefined;
  await act(async () => { pending = view.result.current.handleSubmit(submitEvent); });
  await act(async () => { await view.result.current.handleSubmit(submitEvent); });
  await act(async () => { await view.result.current.handleSubmit(submitEvent); });

  await act(async () => {
    finishUpload?.(true);
    await pending;
  });

  assert.equal(sent.filter((message) => message.type === 'chat.send').length, 1);
  assert.equal(added.filter((message) => message.type === 'user').length, 1);
});

test('el botón queda inerte un momento después de enviar, para que un segundo clic no caiga en Stop', async () => {
  const { view } = renderComposer();
  await act(async () => { view.result.current.setInput('hola'); });
  await act(async () => { await view.result.current.handleSubmit(submitEvent); });

  assert.equal(view.result.current.isSubmitting, true);
  await act(async () => { vi.advanceTimersByTime(1_000); });
  assert.equal(view.result.current.isSubmitting, false);
});

test('si la subida falla, el eco queda como "no se envió" y el texto vuelve al input', async () => {
  const { view, sent, added, deliveryUpdates, idle } = renderComposer();
  await act(async () => {
    view.result.current.setInput('con adjunto');
    view.result.current.setAttachedFiles([new File(['x'], 'captura.png', { type: 'image/png' })]);
  });

  let pending: Promise<void> | undefined;
  await act(async () => { pending = view.result.current.handleSubmit(submitEvent); });
  await act(async () => {
    finishUpload?.(false);
    await pending;
  });

  assert.equal(sent.length, 0);
  assert.deepEqual(deliveryUpdates.map((update) => [update.id, update.state]), [[added[0].clientMessageId, 'failed']]);
  assert.deepEqual(idle, ['session-1']);
  assert.equal(view.result.current.input, 'con adjunto');
  assert.equal(view.result.current.attachedFiles.length, 1);
  assert.ok(added.some((message) => message.type === 'error' && /disk full/.test(String(message.content))));
});
