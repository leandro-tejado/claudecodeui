import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import type { Project } from '@/shared/types';

/*
 * El wizard de alta de proyecto de upstream lo montaba `sidebar/SidebarModals`,
 * que este skin dejó de renderizar: durante un tiempo la consola sólo podía
 * abrir sesiones en los proyectos que ya estaban en la lista. Este test cuida
 * que el botón exista y que confirmar llegue a la API.
 */

const createProjectRequest = vi.fn(async (_payload: { path: string }) => ({
  projectId: 'proj-2',
}));

vi.mock('@/modules/project-creation-wizard', () => ({
  browseFilesystemFolders: vi.fn(async () => ({ path: '~', suggestions: [] })),
  createProjectRequest: (payload: { path: string }) => createProjectRequest(payload),
  getSuggestionRootPath: () => '~',
}));

const project = {
  projectId: 'proj-1',
  displayName: 'Proyecto',
  name: 'proj-1',
  path: '/tmp/proyecto',
  fullPath: '/tmp/proyecto',
  sessions: [],
} as unknown as Project;

const renderSidebar = (onRefresh: () => void) =>
  render(
    <MemoryRouter>
      <SkinSidebar
        projects={[project]}
        selectedProject={project}
        selectedSession={null}
        onProjectSelect={() => {}}
        onSessionSelect={() => {}}
        onNewSession={() => {}}
        onRefresh={onRefresh}
      />
    </MemoryRouter>,
  );

describe('SkinSidebar add project', () => {
  it('adds the typed path and refreshes the list', async () => {
    const onRefresh = vi.fn();
    renderSidebar(onRefresh);

    fireEvent.click(screen.getByTitle('Agregar proyecto'));

    const input = await screen.findByPlaceholderText(/desarrollo\/app-norte/);
    fireEvent.change(input, { target: { value: '/home/leantejado/workspace-leandro/desarrollo/app-norte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() => {
      expect(createProjectRequest).toHaveBeenCalledWith({
        path: '/home/leantejado/workspace-leandro/desarrollo/app-norte',
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
