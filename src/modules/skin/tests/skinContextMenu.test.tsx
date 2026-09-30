import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { composeTabTitle } from '@/modules/skin/hooks/useTabTitle';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * 30-sep: las acciones de proyecto y sesión salieron de la fila y pasaron al
 * clic derecho. Los íconos fijos (estrella, lápiz, tacho) ensuciaban la lista
 * y los de la sesión aparecían encima del ícono de tmux al pasar el mouse.
 * También el título de la pestaña pasó a llevar el nombre de tmux.
 */

const renameProject = vi.fn();
const newSession = vi.fn();
const toggleProjectStar = vi.fn();

vi.mock('@/shared/api', () => ({
  api: {
    renameProject: (...args: unknown[]) => renameProject(...args),
    toggleProjectStar: (...args: unknown[]) => toggleProjectStar(...args),
  },
}));

const session = {
  id: 'ses-1',
  title: 'Accionables reunión',
  lastActivity: new Date().toISOString(),
  tmux: { nombre: 'optimumads-guia-1', vivo: true },
} as unknown as ProjectSession;

const buildProject = (id: string, name: string, sessions: ProjectSession[] = []): Project =>
  ({
    projectId: id,
    displayName: name,
    name: id,
    path: `/tmp/${id}`,
    fullPath: `/tmp/${id}`,
    sessions,
  }) as unknown as Project;

const renderSidebar = (projects: Project[], selectedSession: ProjectSession | null = null) =>
  render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={projects}
          selectedProject={projects[0]}
          selectedSession={selectedSession}
          onProjectSelect={() => {}}
          onSessionSelect={() => {}}
          onNewSession={newSession}
          onProjectDelete={() => {}}
          onSessionDelete={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  renameProject.mockReset().mockResolvedValue({ ok: true });
  newSession.mockReset();
  toggleProjectStar.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ isStarred: true }),
  });
});

describe('SkinSidebar — acciones por clic derecho', () => {
  it('no dibuja estrella, lápiz ni tacho en las filas', () => {
    renderSidebar([buildProject('p1', 'Proyecto', [session])]);

    expect(screen.queryByTitle(/favorito/i)).toBeNull();
    expect(screen.queryByTitle(/Archivar/)).toBeNull();
    expect(screen.queryByTitle(/Renombrar/)).toBeNull();
  });

  it('el clic derecho sobre un proyecto ofrece nueva sesión, fijar, renombrar y quitar', () => {
    renderSidebar([buildProject('p1', 'Proyecto')]);

    fireEvent.contextMenu(screen.getByText('Proyecto'));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Nueva sesión', 'Fijar arriba', 'Renombrar', 'Quitar de la lista']);
  });

  it('"Nueva sesión" del menú abre una sesión en ese proyecto, como el `+` de la cabecera', () => {
    const alfa = buildProject('a', 'Alfa');
    const zeta = buildProject('z', 'Zeta');
    renderSidebar([alfa, zeta]);

    fireEvent.contextMenu(screen.getByText('Zeta'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nueva sesión' }));

    expect(newSession).toHaveBeenCalledTimes(1);
    expect(newSession).toHaveBeenCalledWith(zeta);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('fijar sube el proyecto arriba de todo', async () => {
    renderSidebar([buildProject('a', 'Alfa'), buildProject('z', 'Zeta')]);

    fireEvent.contextMenu(screen.getByText('Zeta'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fijar arriba' }));

    await waitFor(() => {
      const names = screen.getAllByTestId('sidebar-project-row').map((row) => row.textContent);
      expect(names[0]).toContain('Zeta');
    });
    expect(toggleProjectStar).toHaveBeenCalledWith('z');
  });

  it('renombrar cambia sólo el nombre visible del proyecto', async () => {
    renderSidebar([buildProject('p1', 'carpeta-original')]);

    fireEvent.contextMenu(screen.getByText('carpeta-original'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renombrar' }));
    const input = screen.getByLabelText('Nombre del proyecto');
    fireEvent.change(input, { target: { value: 'Mi proyecto' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Mi proyecto')).toBeTruthy();
    expect(renameProject).toHaveBeenCalledWith('p1', 'Mi proyecto');
    // La ruta sigue siendo la de la carpeta: no se movió nada en disco.
    expect(screen.getByText('/tmp/p1')).toBeTruthy();
  });

  it('el clic derecho sobre una sesión ofrece abrir, renombrar y archivar', () => {
    renderSidebar([buildProject('p1', 'Proyecto', [session])]);

    fireEvent.contextMenu(screen.getByRole('link', { name: /Accionables reunión/ }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Abrir en pestaña nueva', 'Renombrar', 'Archivar sesión']);
  });

  it('Escape cierra el menú', () => {
    renderSidebar([buildProject('p1', 'Proyecto')]);

    fireEvent.contextMenu(screen.getByText('Proyecto'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('título de la pestaña', () => {
  it('lleva el nombre de tmux de la sesión abierta', () => {
    renderSidebar([buildProject('p1', 'Proyecto', [session])], session);
    expect(document.title).toBe('LT · optimumads-guia-1');
  });

  it('sin tmux cae al título de la sesión', () => {
    const sinTmux = { ...session, id: 'ses-2', tmux: null } as unknown as ProjectSession;
    renderSidebar([buildProject('p1', 'Proyecto', [sinTmux])], sinTmux);
    expect(document.title).toBe('LT · Accionables reunión');
  });

  it('compone el prefijo de corriendo y el nombre solo', () => {
    expect(composeTabTitle('orquestador', true)).toBe('● LT · orquestador');
    expect(composeTabTitle(null, false)).toBe('LT');
  });
});
