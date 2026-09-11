import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * La fila de sesión tiene que ser un ancla con `href` real: es lo que hace que
 * la rueda del ratón, Ctrl+click y el menú contextual abran la sesión en una
 * pestaña nueva. El rediseño propio la había dejado como un `<div onClick>` y
 * esos tres gestos no hacían nada.
 */

const session = {
  id: 'ses-1',
  title: 'Sesión de prueba',
  lastActivity: new Date().toISOString(),
} as unknown as ProjectSession;

const project = {
  projectId: 'proj-1',
  displayName: 'Proyecto',
  name: 'proj-1',
  path: '/tmp/proyecto',
  fullPath: '/tmp/proyecto',
  sessions: [session],
} as unknown as Project;

const renderSidebar = (onSessionSelect: (session: ProjectSession) => void) =>
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

describe('SkinSidebar session row', () => {
  it('renders the session as a link to its own URL', () => {
    renderSidebar(() => {});

    const link = screen.getByRole('link', { name: /Sesión de prueba/ });
    expect(link.getAttribute('href')).toBe('/session/ses-1');
  });

  it('navigates in-app on a plain click', () => {
    const onSessionSelect = vi.fn();
    renderSidebar(onSessionSelect);

    fireEvent.click(screen.getByRole('link', { name: /Sesión de prueba/ }));
    expect(onSessionSelect).toHaveBeenCalledTimes(1);
  });

  it('leaves a modified click to the browser so it opens a new tab', () => {
    const onSessionSelect = vi.fn();
    renderSidebar(onSessionSelect);

    const link = screen.getByRole('link', { name: /Sesión de prueba/ });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    expect(onSessionSelect).not.toHaveBeenCalled();
  });

  it('keeps the action buttons outside the anchor', () => {
    renderSidebar(() => {});

    const link = screen.getByRole('link', { name: /Sesión de prueba/ });
    expect(link.querySelector('button')).toBeNull();
  });
});
