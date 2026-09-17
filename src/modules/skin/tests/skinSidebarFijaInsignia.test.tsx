import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project } from '@/shared/types';

/*
 * La insignia de la sesión orquestadora fija (17-sep, Fase 3 de
 * `17-septiembre-ux-sesiones-y-cuota.md`): `tmux.fija` llega igual que
 * `tmux.vivo`, sembrado por `resolverTmux()`. Se renderiza distinta del
 * ícono de tmux normal y esa sesión siempre queda primera en su proyecto.
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

const session = (id: string, title: string, tmux: { nombre: string; vivo: boolean; fija?: boolean } | null) => ({
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

describe('insignia de sesión fija', () => {
  it('la sesión fija muestra el pin, no el ícono de tmux normal', () => {
    renderSidebar([session('ses-orq', 'orquestador', { nombre: 'orquestador', vivo: true, fija: true })]);

    expect(screen.getByTitle('Sesión orquestadora fija — siempre prendida')).toBeTruthy();
    expect(screen.queryByTitle(/^tmux:/)).toBeNull();
  });

  it('una sesión normal con tmux vivo sigue mostrando el ícono de siempre, no el pin', () => {
    renderSidebar([session('ses-1', 'Normal', { nombre: 'cloudcli-proj-abc', vivo: true })]);

    expect(screen.getByTitle('tmux: cloudcli-proj-abc')).toBeTruthy();
    expect(screen.queryByTitle('Sesión orquestadora fija — siempre prendida')).toBeNull();
  });

  it('la sesión fija queda primera en su proyecto sin importar el orden de llegada', () => {
    renderSidebar([
      session('ses-1', 'Primera por actividad', { nombre: 'cloudcli-a', vivo: true }),
      session('ses-2', 'Segunda por actividad', null),
      session('ses-orq', 'orquestador', { nombre: 'orquestador', vivo: true, fija: true }),
    ]);

    const titles = screen.getAllByRole('link').map((link) => link.textContent);
    const firstSessionTitleIndex = titles.findIndex((text) => text?.includes('orquestador'));
    const otherIndex = titles.findIndex((text) => text?.includes('Primera por actividad'));

    expect(firstSessionTitleIndex).toBeGreaterThanOrEqual(0);
    expect(firstSessionTitleIndex).toBeLessThan(otherIndex);
  });
});
