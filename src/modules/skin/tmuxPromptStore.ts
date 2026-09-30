import { useEffect, useSyncExternalStore } from 'react';

import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { ServerEvent } from '@/shared/types';

/*
 * Las preguntas de permiso que un pane de tmux tiene abiertas —"Do you want
 * to proceed?", "Allow this read outside the working directories?"— y que
 * no dejan rastro en el transcript. El servidor las lee de la pantalla del
 * pane (`tmux-prompt.service.ts`) y manda la lista entera cada vez que
 * cambia; acá se guarda para que el chat las muestre con sus botones y el
 * sidebar marque la sesión como "esperando respuesta".
 *
 * Mismo store externo mínimo que `sessionBudgetStore`: lo necesitan el
 * sidebar y el chat a la vez, cada uno por su lado.
 */

/** Mirror de `PromptTmuxPendiente` en `server/modules/websocket/services/tmux-prompt.service.ts`. */
export type TmuxPrompt = {
  id: string;
  sessionId: string;
  pane: string;
  pregunta: string;
  detalle: string;
  opciones: Array<{ indice: number; numero: number | null; etiqueta: string; libre?: boolean }>;
  seleccionada: number;
  desde: string;
};

export type TmuxPromptState = {
  prompts: TmuxPrompt[];
  /** Por pane: el último rechazo del servidor a una respuesta, mientras el prompt siga siendo el mismo. */
  errors: Map<string, { promptId: string; error: string }>;
};

let state: TmuxPromptState = { prompts: [], errors: new Map() };
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

const isPrompt = (value: unknown): value is TmuxPrompt => {
  if (!value || typeof value !== 'object') return false;
  const prompt = value as Record<string, unknown>;
  return typeof prompt.id === 'string'
    && typeof prompt.sessionId === 'string'
    && typeof prompt.pane === 'string'
    && typeof prompt.pregunta === 'string'
    && Array.isArray(prompt.opciones);
};

/** Reemplaza la lista entera: el servidor siempre manda todas. */
export const publishTmuxPrompts = (prompts: unknown): void => {
  const next = Array.isArray(prompts) ? prompts.filter(isPrompt) : [];
  // Un error sobrevive solo mientras su prompt siga ahí.
  const errors = new Map(
    [...state.errors].filter(([pane, error]) => next.some((prompt) => prompt.pane === pane && prompt.id === error.promptId)),
  );
  state = { prompts: next, errors };
  emit();
};

export const publishTmuxPromptError = (pane: string, promptId: string, error: string): void => {
  const errors = new Map(state.errors);
  errors.set(pane, { promptId, error });
  state = { ...state, errors };
  emit();
};

/** Solo para tests. */
export const resetTmuxPromptStoreForTests = (): void => {
  state = { prompts: [], errors: new Map() };
  emit();
};

export const useTmuxPrompts = (): TmuxPromptState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * Pide la lista al servidor y la mantiene al día con lo que llega por el
 * socket. Se monta una sola vez (`ProjectSidebarRegion`). La lista se pide
 * en vez de esperarla al conectar: así nunca llega antes de que haya alguien
 * escuchando, y tras una reconexión se vuelve a pedir.
 */
export const useTmuxPromptsFeed = (): void => {
  const { subscribe: subscribeSocket, sendMessage } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribeSocket((event: ServerEvent) => {
      if (event?.kind === 'tmux_prompts') {
        publishTmuxPrompts(event.prompts);
        return;
      }
      if (event?.kind === 'tmux_prompt_error') {
        if (typeof event.pane === 'string' && typeof event.promptId === 'string') {
          publishTmuxPromptError(event.pane, event.promptId, String(event.error ?? ''));
        }
        return;
      }
      if (event?.kind === 'websocket_reconnected') {
        sendMessage({ type: 'chat.tmux-prompts' });
      }
    });
    sendMessage({ type: 'chat.tmux-prompts' });
    return unsubscribe;
  }, [subscribeSocket, sendMessage]);
};
