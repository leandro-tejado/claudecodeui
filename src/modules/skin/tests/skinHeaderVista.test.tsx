import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SkinHeader, useSkinUi } from '@/modules/skin';
import type { AppTab, Project } from '@/shared/types';

/*
 * La cabecera del boceto 09-oct (Fase 2 del plan 09-octubre-rediseno-vista-principal):
 * una fila, sin pestañas. Terminal, Git y Navegador no aparecen aunque estén
 * habilitados; Archivos es un ícono que abre el panel de la derecha, también
 * con Ctrl+B.
 */

vi.mock('@/modules/usage-window', () => ({ UsageWindowIndicator: () => <span data-testid="anillo" /> }));
vi.mock('@/modules/cuentas/TopeAviso', () => ({ default: () => null }));
vi.mock('@/modules/plugins', () => ({
  usePlugins: () => ({ plugins: [{ name: 'terminal', displayName: 'Terminal', enabled: true, icon: '' }] }),
  PluginIcon: () => null,
}));
vi.mock('@/modules/skin/SkinRecursos', () => ({ default: () => null }));
vi.mock('@/shared/api', () => ({ authenticatedFetch: vi.fn().mockResolvedValue({ ok: false }) }));

const project = { projectId: 'p', displayName: 'cloudcli', name: 'p', path: '/tmp/p', fullPath: '/tmp/p', sessions: [] } as unknown as Project;

function PanelState() {
  const { filesPanelOpen } = useSkinUi();
  return <span data-testid="panel">{filesPanelOpen ? 'abierto' : 'cerrado'}</span>;
}

const renderHeader = (activeTab: AppTab = 'chat', setActiveTab = vi.fn()) =>
  render(
    <MemoryRouter>
      <SkinHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedProject={project}
        selectedSession={null}
        shouldShowTasksTab
        shouldShowBrowserTab
        isMobile={false}
        onMenuClick={() => {}}
      />
      <PanelState />
    </MemoryRouter>,
  );

describe('SkinHeader — cabecera de una fila (boceto 09-oct)', () => {
  it('no tiene pestañas: ni Terminal, ni Git, ni Navegador, aunque estén habilitados', () => {
    renderHeader();

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    for (const nombre of [/terminal/i, /git/i, /navegador|browser/i, /tareas|tasks/i]) {
      expect(screen.queryByRole('button', { name: nombre })).toBeNull();
    }
  });

  it('muestra título, proyecto, anillo y el ícono de Archivos', () => {
    renderHeader();

    expect(screen.getByRole('heading').textContent).toContain('cloudcli');
    expect(screen.getByTestId('anillo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archivos del proyecto' })).toBeTruthy();
  });

  it('el ícono y Ctrl+B abren y cierran el panel de Archivos', () => {
    renderHeader();
    const inicial = screen.getByTestId('panel').textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Archivos del proyecto' }));
    const trasClic = screen.getByTestId('panel').textContent;
    expect(trasClic).not.toBe(inicial);

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.getByTestId('panel').textContent).toBe(inicial);
  });

  it('fuera del chat (una vista guardada de antes) la flecha vuelve al chat', () => {
    const setActiveTab = vi.fn();
    renderHeader('git', setActiveTab);

    fireEvent.click(screen.getByRole('button', { name: 'Volver al chat' }));
    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });
});
