import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project } from '@/shared/types';

/*
 * El badge `tmux` y el filtro "solo tmux" (plan `16-septiembre-os-orquestador-y-recursos.md`,
 * Fase 2). El campo `tmux` llega igual que `subagentCount`: por el índice
 * `[key: string]: unknown` de `ProjectSession`, con la forma que arma
 * `resolverTmux()` en `projects-with-sessions-fetch.service.ts`.
 */

const buildProject = (sessions: Record<string, unknown>[]): Project =>
  ({
    projectId: 'proj-1',
    displayName: 'Proyecto',
    name: 'proj-1',
    path: '/tmp/proyecto',
    fullPath: '/tmp/proyecto',
    sessions,
  }) as unknown as Project;

const session = (id: string, title: string, tmux: { nombre: string; vivo: boolean } | null) => ({
  id,
  title,
  lastActivity: new Date('2026-09-17T12:00:00Z').toISOString(),
  tmux,
});

const renderSidebar = (sessions: Record<string, unknown>[]) => {
  const project = buildProject(sessions);
  return render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={[project]}
          selectedProject={project}
          selectedSession={null}
          onProjectSelect={() => {}}
          onSessionSelect={vi.fn()}
          onNewSession={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );
};

describe('badge de tmux en la fila', () => {
  it('aparece solo en las sesiones con tmux vivo', () => {
    renderSidebar([
      session('ses-1', 'Con tmux', { nombre: 'cloudcli-proj-abc', vivo: true }),
      session('ses-2', 'Sin tmux', null),
    ]);

    expect(screen.getByTitle('tmux: cloudcli-proj-abc')).toBeTruthy();
    expect(screen.queryByTitle('tmux: cloudcli-proj-abc')?.closest('a')?.getAttribute('href')).toContain('ses-1');
  });

  it('una sesión con tmux caído no muestra el badge', () => {
    renderSidebar([session('ses-1', 'Tmux caído', { nombre: 'cloudcli-proj-abc', vivo: false })]);

    expect(screen.queryByTitle(/tmux:/)).toBeNull();
  });
});

describe('filtro "solo tmux"', () => {
  it('arranca prendido: oculta las sesiones sin tmux vivo', () => {
    renderSidebar([
      session('ses-1', 'Con tmux', { nombre: 'cloudcli-proj-abc', vivo: true }),
      session('ses-2', 'Sin tmux', null),
      session('ses-3', 'Tmux caído', { nombre: 'cloudcli-proj-def', vivo: false }),
    ]);

    expect(screen.getByText('Con tmux')).toBeTruthy();
    expect(screen.queryByText('Sin tmux')).toBeNull();
    expect(screen.queryByText('Tmux caído')).toBeNull();
  });

  it('el interruptor revela el resto y el contador de ocultas coincide', () => {
    renderSidebar([
      session('ses-1', 'Con tmux', { nombre: 'cloudcli-proj-abc', vivo: true }),
      session('ses-2', 'Sin tmux', null),
      session('ses-3', 'Tmux caído', { nombre: 'cloudcli-proj-def', vivo: false }),
    ]);

    expect(screen.getByText('2 ocultas')).toBeTruthy();

    fireEvent.click(screen.getByTitle(/Mostrando solo sesiones con tmux vivo/));

    expect(screen.getByText('Con tmux')).toBeTruthy();
    expect(screen.getByText('Sin tmux')).toBeTruthy();
    expect(screen.getByText('Tmux caído')).toBeTruthy();
    expect(screen.queryByText(/ocultas/)).toBeNull();
  });

  it('sin registro (todas las sesiones en null) no deja el sidebar vacío', () => {
    renderSidebar([session('ses-1', 'Sin dato de tmux', null), session('ses-2', 'Tampoco', null)]);

    expect(screen.getByText('Sin dato de tmux')).toBeTruthy();
    expect(screen.getByText('Tampoco')).toBeTruthy();
    expect(screen.queryByText(/ocultas/)).toBeNull();
  });
});
