import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project } from '@/shared/types';

/*
 * La entrada fija "Session Orquestadora" (23-sep, Fase 7 de
 * `23-septiembre-limpieza-sesiones-vps.md`): una sola por máquina, siempre
 * arriba de todos los proyectos, ajena a la búsqueda y al filtro de tmux —
 * distinta del ícono `Pin` que ya muestra la sesión fija DENTRO de su propio
 * proyecto (ver `skinSidebarFijaInsignia.test.tsx`, que no se toca).
 */

const buildProject = (id: string, name: string, sessions: Record<string, unknown>[]): Project =>
  ({
    projectId: id,
    displayName: name,
    name: id,
    path: `/tmp/${id}`,
    fullPath: `/tmp/${id}`,
    sessions,
  }) as unknown as Project;

const session = (id: string, title: string, tmux: { nombre: string; vivo: boolean; fija?: boolean } | null) => ({
  id,
  title,
  lastActivity: new Date('2026-09-23T12:00:00Z').toISOString(),
  tmux,
});

const renderSidebar = (projects: Project[], selectedSession: Record<string, unknown> | null = null) =>
  render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={projects}
          selectedProject={projects[0] ?? null}
          selectedSession={selectedSession as never}
          onProjectSelect={() => {}}
          onSessionSelect={vi.fn()}
          onNewSession={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );

describe('entrada fija "Session Orquestadora"', () => {
  it('aparece arriba de todos los proyectos con el texto exacto', () => {
    const orquestador = buildProject('workspace-leandro', 'workspace-leandro', [
      session('ses-orq', 'orquestador', { nombre: 'orquestador', vivo: true, fija: true }),
    ]);
    const otro = buildProject('zz-proyecto', 'zz-proyecto', [session('ses-1', 'Normal', null)]);

    renderSidebar([otro, orquestador]);

    expect(screen.getByText('Session Orquestadora')).toBeTruthy();
    expect(screen.getByTestId('sidebar-session-orquestadora')).toBeTruthy();
  });

  it('no aparece si ninguna sesión está marcada fija', () => {
    const proyecto = buildProject('proj-1', 'Proyecto', [session('ses-1', 'Normal', { nombre: 'cloudcli-a', vivo: true })]);

    renderSidebar([proyecto]);

    expect(screen.queryByText('Session Orquestadora')).toBeNull();
  });

  it('al hacer click, selecciona esa sesión', () => {
    const onSessionSelect = vi.fn();
    const orquestador = buildProject('workspace-leandro', 'workspace-leandro', [
      session('ses-orq', 'orquestador', { nombre: 'orquestador', vivo: true, fija: true }),
    ]);

    render(
      <MemoryRouter>
        <UiPreferencesProvider>
          <SkinSidebar
            projects={[orquestador]}
            selectedProject={orquestador}
            selectedSession={null}
            onProjectSelect={() => {}}
            onSessionSelect={onSessionSelect}
            onNewSession={() => {}}
          />
        </UiPreferencesProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('sidebar-session-orquestadora'));

    expect(onSessionSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'ses-orq' }));
  });

  it('sigue visible con el filtro de solo-tmux activo y con una búsqueda que no matchea', () => {
    const orquestador = buildProject('workspace-leandro', 'workspace-leandro', [
      session('ses-orq', 'orquestador', { nombre: 'orquestador', vivo: true, fija: true }),
    ]);

    renderSidebar([orquestador]);

    // El filtro "solo tmux" arranca prendido por defecto — la entrada fija
    // tiene que seguir ahí igual, porque se calcula sobre `projects`, no
    // sobre la lista ya filtrada.
    expect(screen.getByText('Session Orquestadora')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Buscar'));
    fireEvent.change(screen.getByPlaceholderText('Buscar proyecto o sesión'), {
      target: { value: 'algo que no existe' },
    });

    expect(screen.getByText('Session Orquestadora')).toBeTruthy();
  });
});
