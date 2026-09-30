import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import {
  publishTmuxPrompts,
  resetTmuxPromptStoreForTests,
  type TmuxPrompt,
} from '@/modules/skin/tmuxPromptStore';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * 30-sep: `optimumads-guia-1` estuvo casi 10 h frenada en el "Do you want to
 * proceed?" de la regla `ask` de `Bash(git push *)` y CloudCLI no mostraba
 * nada. La pregunta tiene que verse en el chat de esa sesión, con un botón
 * por opción, y la sesión marcarse en el sidebar como "esperando respuesta".
 */

const PROMPT: TmuxPrompt = {
  id: 'huella-1',
  sessionId: 'ses-frenada',
  pane: 'optimumads-guia-1',
  pregunta: 'Do you want to proceed?',
  detalle: 'Bash command\n\ngit push -q\n\nAsk rule Bash(git push *) overrides auto mode for this command.',
  opciones: [
    { indice: 0, numero: 1, etiqueta: 'Yes' },
    { indice: 1, numero: 2, etiqueta: 'No' },
  ],
  seleccionada: 0,
  desde: '2026-09-30T04:40:00.000Z',
};

afterEach(() => {
  resetTmuxPromptStoreForTests();
});

const buildSession = (id: string): ProjectSession =>
  ({ id, title: `Sesión ${id}`, lastActivity: new Date().toISOString() }) as unknown as ProjectSession;

const renderSidebar = (sessions: ProjectSession[]) => {
  const project = {
    projectId: 'proj',
    displayName: 'Proyecto',
    name: 'proj',
    path: '/tmp/proyecto',
    fullPath: '/tmp/proyecto',
    sessions,
  } as unknown as Project;
  render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={[project]}
          selectedProject={project}
          selectedSession={null}
          activeSessions={new Set(sessions.map((session) => session.id))}
          onProjectSelect={() => {}}
          onSessionSelect={() => {}}
          onNewSession={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );
};

describe('sidebar: sesión esperando respuesta', () => {
  it('la sesión frenada se marca "esperando respuesta", por encima de "corriendo", y se desmarca al contestar', () => {
    renderSidebar([buildSession('ses-frenada'), buildSession('ses-otra')]);
    expect(screen.queryByTestId('session-waiting-answer')).toBeNull();

    act(() => { publishTmuxPrompts([PROMPT]); });

    const chip = screen.getByTestId('session-waiting-answer');
    expect(chip.textContent).toBe('esperando respuesta');
    expect(chip.title).toBe('Do you want to proceed?');
    const states = screen.getAllByTestId('session-status-badge').map((badge) => badge.dataset.state);
    expect(states).toEqual(['waiting', 'running']);

    act(() => { publishTmuxPrompts([]); });
    expect(screen.queryByTestId('session-waiting-answer')).toBeNull();
  });
});
