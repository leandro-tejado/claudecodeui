import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';
import type { PermissionMode, Project, ProjectSession } from '@/shared/types';

/**
 * Fase 7, paso 5 (cliente): hoy el composer de una sesión de tmux NO manda
 * nada mientras su turno sigue en curso — `isLoading` lo manda al cajón del
 * borrador durable (`QueuedMessageCard`), igual que a una sesión headless,
 * aunque Claude Code acepte un mensaje más en su propia cola
 * (`attachment{type:"queued_command"}`) y el server lo entregue por
 * `teclearEnPane` (`chat.send-tmux`), nunca por un segundo turno del SDK.
 * `tmux/rafaga` (e2e) mide "2 de 5 mensajes durante el turno"; esto es la
 * parte unitaria: un solo mensaje, durante el turno, tiene que salir una vez
 * por `chat.send-tmux` y nunca quedar solo en el cajón.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };
const SESSION: ProjectSession = { id: 'session-1' };

const submit = async (opts: { isLoading: boolean; runsInTmux: boolean }) => {
  const sent: Array<{ type: string; sessionId?: string; content?: string }> = [];
  const sessionStoreStub = {
    setRunsInTmux: () => undefined,
    runsInTmux: () => opts.runsInTmux,
  } as unknown as SessionStore;

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
      isLoading: opts.isLoading,
      processingSessions: new Map(),
      canAbortSession: false,
      tokenBudget: null,
      sendMessage: (message) => { sent.push(message as { type: string; sessionId?: string; content?: string }); },
      scrollToBottom: () => undefined,
      addMessage: () => undefined,
      setIsUserScrolledUp: () => undefined,
      setPendingPermissionRequests: () => undefined,
      sessionStore: sessionStoreStub,
    }),
  );
  await act(async () => { view.result.current.setInput('mensaje durante el turno'); });
  await act(async () => { await view.result.current.handleSubmit({ preventDefault: () => undefined } as never); });
  return { sent, view };
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test('una sesión de tmux con el turno en curso manda el mensaje por chat.send-tmux, no lo encola', async () => {
  const { sent, view } = await submit({ isLoading: true, runsInTmux: true });

  const tmuxSends = sent.filter((message) => message.type === 'chat.send-tmux');
  assert.equal(tmuxSends.length, 1, 'el mensaje sale por chat.send-tmux exactamente una vez');
  assert.equal(tmuxSends[0]?.content, 'mensaje durante el turno');
  assert.equal(sent.some((message) => message.type === 'chat.send'), false, 'nunca por el SDK');
  assert.equal(view.result.current.queuedDraft, null, 'no queda en el cajón de borradores');
});

test('una sesión headless con el turno en curso sigue encolando (no manda nada)', async () => {
  const { sent, view } = await submit({ isLoading: true, runsInTmux: false });

  assert.equal(sent.length, 0, 'headless: nada sale mientras el turno corre');
  assert.ok(view.result.current.queuedDraft, 'el mensaje queda en el cajón, como antes');
});

test('una sesión de tmux libre manda normalmente por chat.send-tmux', async () => {
  const { sent } = await submit({ isLoading: false, runsInTmux: true });

  assert.equal(sent.filter((message) => message.type === 'chat.send-tmux').length, 1);
});
