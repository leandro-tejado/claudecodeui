import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { toggleSidebarCollapsed } from '@/modules/skin/skinUiStore';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project } from '@/shared/types';

/*
 * La barra del rediseño 09-oct (Fase 3 del plan `09-octubre-rediseno-vista-principal.md`):
 * sin botones de mantenimiento arriba, Nuevo proyecto y Ajustes en el pie, lo
 * demás en el menú de Ajustes, y plegada queda un riel de 52 px que se asoma
 * con el cursor.
 */

vi.mock('@/shared/api', () => ({
  api: {
    archivedProjects: vi.fn(async () => ({ ok: true, json: async () => ({ data: { projects: [] } }) })),
    getArchivedSessions: vi.fn(async () => ({ ok: true, json: async () => ({ data: { sessions: [] } }) })),
  },
}));

const project = {
  projectId: 'proj-1',
  displayName: 'Proyecto',
  name: 'proj-1',
  path: '/tmp/proyecto',
  fullPath: '/tmp/proyecto',
  sessions: [{ id: 'ses-1', title: 'Una sesión', lastActivity: new Date().toISOString() }],
} as unknown as Project;

const renderBarra = (extra: Partial<Parameters<typeof SkinSidebar>[0]> = {}) =>
  render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={[project]}
          selectedProject={project}
          selectedSession={null}
          onProjectSelect={() => {}}
          onSessionSelect={() => {}}
          onNewSession={() => {}}
          {...extra}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );

// El store del skin es de módulo y persiste en localStorage: en reposo es el
// riel, así que cada prueba de «barra abierta» la fija antes y después.
const desplegarSiHaceFalta = () => {
  if (localStorage.getItem('skin:barra-fijada') !== '1') act(() => toggleSidebarCollapsed());
};

describe('barra abierta', () => {
  beforeEach(desplegarSiHaceFalta);
  afterEach(desplegarSiHaceFalta);

  it('arriba no quedan Actualizar, el filtro de tmux ni Archivados, ni el título «Consola»', () => {
    renderBarra();
    expect(screen.queryByTitle('Actualizar')).toBeNull();
    expect(screen.queryByTitle(/tmux/)).toBeNull();
    expect(screen.queryByTitle(/archivados/i)).toBeNull();
    expect(screen.queryByText('Consola')).toBeNull();
    expect(screen.getByTitle('Buscar')).toBeTruthy();
    expect(screen.getByTitle('Nueva sesión')).toBeTruthy();
  });

  it('Nuevo proyecto vive en el pie, junto a Ajustes', () => {
    renderBarra();
    const nuevo = screen.getByTestId('barra-nuevo-proyecto');
    const ajustes = screen.getByTestId('barra-ajustes');
    expect(nuevo.parentElement).toBe(ajustes.parentElement);
    fireEvent.click(nuevo);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Ajustes abre un menú con Archivados, Tareas, Plugins, Tema y Ajustes', () => {
    const onShowTab = vi.fn();
    const onOpenSettingsTab = vi.fn();
    const onToggleTheme = vi.fn();
    const onShowSettings = vi.fn();
    renderBarra({ onShowTab, onOpenSettingsTab, onToggleTheme, onShowSettings });

    fireEvent.click(screen.getByTestId('barra-ajustes'));
    const menu = screen.getByRole('menu', { name: 'Ajustes' });
    const rotulos = within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim());
    expect(rotulos).toEqual(['Archivados', 'Tareas', 'Plugins', 'Servicios', 'Tema oscuro', 'Ajustes']);

    fireEvent.click(within(menu).getByText('Tareas'));
    expect(onShowTab).toHaveBeenCalledWith('tasks');
  });

  it('Archivados del menú lleva a la vista de archivados y «Volver» regresa', async () => {
    renderBarra();
    fireEvent.click(screen.getByTestId('barra-ajustes'));
    await act(async () => {
      fireEvent.click(screen.getByText('Archivados'));
    });
    expect(screen.getByText('No hay nada archivado.')).toBeTruthy();
    fireEvent.click(screen.getByText('Volver'));
    expect(screen.getByText('Una sesión')).toBeTruthy();
  });
});

describe('barra plegada: el riel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    desplegarSiHaceFalta();
  });

  it('el logo la pliega a un riel de 52 px con logo, buscar, proyectos, nuevo proyecto y ajustes', () => {
    renderBarra();
    fireEvent.click(screen.getByTestId('barra-logo'));
    const riel = screen.getByTestId('barra-riel');
    expect(screen.getByTestId('barra-lateral').style.width).toBe('52px');
    for (const nombre of ['Buscar', 'Proyectos', 'Nuevo proyecto', 'Ajustes']) {
      expect(within(riel).getByRole('button', { name: nombre })).toBeTruthy();
    }
    expect(screen.queryByText('Una sesión')).toBeNull();
  });

  it('el cursor la asoma a los 150 ms y la vuelve a plegar 250 ms después de salir', () => {
    renderBarra();
    fireEvent.click(screen.getByTestId('barra-logo'));
    const barra = screen.getByTestId('barra-lateral');

    fireEvent.mouseEnter(barra);
    act(() => vi.advanceTimersByTime(140));
    expect(screen.getByTestId('barra-riel')).toBeTruthy();
    act(() => vi.advanceTimersByTime(20));
    expect(screen.queryByTestId('barra-riel')).toBeNull();
    expect(screen.getByText('Una sesión')).toBeTruthy();
    expect(barra.style.width).not.toBe('52px');

    fireEvent.mouseLeave(barra);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('barra-riel')).toBeNull();
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByTestId('barra-riel')).toBeTruthy();
  });

  it('pasar de largo no la mueve: salir antes de los 150 ms cancela el asomo', () => {
    renderBarra();
    fireEvent.click(screen.getByTestId('barra-logo'));
    const barra = screen.getByTestId('barra-lateral');
    fireEvent.mouseEnter(barra);
    act(() => vi.advanceTimersByTime(80));
    fireEvent.mouseLeave(barra);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId('barra-riel')).toBeTruthy();
  });

  it('un clic en el logo mientras está asomada la deja fija', () => {
    renderBarra();
    fireEvent.click(screen.getByTestId('barra-logo'));
    const barra = screen.getByTestId('barra-lateral');
    fireEvent.mouseEnter(barra);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(screen.getByTestId('barra-logo'));
    expect(barra.getAttribute('data-plegada')).toBe('false');
    fireEvent.mouseLeave(barra);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('barra-riel')).toBeNull();
  });
});
