import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * El badge de subagentes viene de `subagentCount`/`subagents`, campos que
 * `projects-with-sessions-fetch.service.ts` agrega a cada sesión — no están
 * declarados en `ProjectSession` (llegan por su índice `[key: string]:
 * unknown`), así que estos fixtures los llevan igual que los mandaría la API.
 */

const buildProject = (session: Record<string, unknown>): Project =>
  ({
    projectId: 'proj-1',
    displayName: 'Proyecto',
    name: 'proj-1',
    path: '/tmp/proyecto',
    fullPath: '/tmp/proyecto',
    sessions: [session],
  }) as unknown as Project;

const renderSidebar = (session: Record<string, unknown>, onSessionSelect = vi.fn()) => {
  const project = buildProject(session);
  render(
    <MemoryRouter>
      <SkinSidebar
        projects={[project]}
        selectedProject={project}
        selectedSession={null}
        onProjectSelect={() => {}}
        onSessionSelect={onSessionSelect}
        onNewSession={() => {}}
      />
    </MemoryRouter>,
  );
  return { onSessionSelect };
};

const sessionWithoutSubagents = {
  id: 'ses-1',
  title: 'Sesión sin subagentes',
  lastActivity: new Date().toISOString(),
  subagentCount: 0,
  subagents: [],
};

const sessionWithSubagents = {
  id: 'ses-2',
  title: 'Sesión con subagentes',
  lastActivity: new Date().toISOString(),
  subagentCount: 5,
  subagents: [
    {
      id: 'toolu_1',
      type: 'dev',
      description: 'revisar el módulo de sesiones',
      model: 'claude-sonnet-5',
      status: 'completed',
    },
    {
      id: 'toolu_2',
      type: 'general-purpose',
      description: 'buscar referencias del store',
      model: null,
      status: 'running',
    },
  ],
};

describe('SkinSidebar subagent badge', () => {
  it('does not render a badge when subagentCount is 0', () => {
    renderSidebar(sessionWithoutSubagents);
    expect(screen.queryByRole('button', { name: '0' })).toBeNull();
    expect(screen.queryByTitle(/subagentes desde que existe esta sesion/)).toBeNull();
  });

  it('renders the badge with the count when subagentCount is greater than 0', () => {
    renderSidebar(sessionWithSubagents);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('the tooltip states exactly what the number is, and that it is cumulative', () => {
    renderSidebar(sessionWithSubagents);
    const badge = screen.getByTitle('5 subagentes desde que existe esta sesion');
    expect(badge).toBeTruthy();
    // "desde que existe esta sesión" is what says it's cumulative — never
    // split into two figures (e.g. "hoy: N, total: M").
    expect(badge.getAttribute('title')).not.toMatch(/hoy/i);
  });

  it('clicking the badge opens a popover listing type, model and status for each subagent', () => {
    renderSidebar(sessionWithSubagents);

    fireEvent.click(screen.getByTitle('5 subagentes desde que existe esta sesion'));

    expect(screen.getByRole('menu', { name: 'Subagentes de esta sesión' })).toBeTruthy();
    expect(screen.getByText('dev')).toBeTruthy();
    expect(screen.getByText(/claude-sonnet-5 · terminado/)).toBeTruthy();
    expect(screen.getByText('general-purpose')).toBeTruthy();
    expect(screen.getByText(/— · corriendo/)).toBeTruthy();
  });

  it('clicking a subagent selects the session with a search target that jumps the chat to its Task card', () => {
    const { onSessionSelect } = renderSidebar(sessionWithSubagents);

    fireEvent.click(screen.getByTitle('5 subagentes desde que existe esta sesion'));
    fireEvent.click(screen.getByText('dev'));

    expect(onSessionSelect).toHaveBeenCalledTimes(1);
    const [selected] = onSessionSelect.mock.calls[0] as [ProjectSession];
    expect(selected.id).toBe('ses-2');
    expect((selected as unknown as { __searchTargetSnippet: string }).__searchTargetSnippet).toBe(
      'revisar el módulo de sesiones',
    );

    // The popover closes once a target is chosen.
    expect(screen.queryByRole('menu', { name: 'Subagentes de esta sesión' })).toBeNull();
  });

  it('closes the popover on outside click', () => {
    renderSidebar(sessionWithSubagents);

    fireEvent.click(screen.getByTitle('5 subagentes desde que existe esta sesion'));
    expect(screen.getByRole('menu', { name: 'Subagentes de esta sesión' })).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu', { name: 'Subagentes de esta sesión' })).toBeNull();
  });
});
