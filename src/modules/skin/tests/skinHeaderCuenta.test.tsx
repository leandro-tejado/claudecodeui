import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SkinHeader } from '@/modules/skin';
import { elegirCuentaNueva, reiniciarCuentaNueva } from '@/modules/cuentas';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * El chip de cuenta y el anillo de cuota de la cabecera siguen a la sesión
 * abierta (06-octubre-vps-multi-cuenta, Fase 3). Los hijos pesados se mockean:
 * lo que se prueba es qué cuenta les llega.
 */

const { anilloMock, avisoMock } = vi.hoisted(() => ({ anilloMock: vi.fn(), avisoMock: vi.fn() }));

vi.mock('@/modules/usage-window', () => ({
  UsageWindowIndicator: (props: { cuenta?: string }) => {
    anilloMock(props.cuenta);
    return <span data-testid="anillo" data-cuenta={props.cuenta} />;
  },
}));
vi.mock('@/modules/cuentas/TopeAviso', () => ({
  default: (props: { cuenta: string; onAbrirConCuenta?: (id: string) => void }) => {
    avisoMock(props.cuenta);
    return <button data-testid="aviso-mock" onClick={() => props.onAbrirConCuenta?.('optimum')} />;
  },
}));
vi.mock('@/modules/plugins', () => ({ usePlugins: () => ({ plugins: [] }), PluginIcon: () => null }));
vi.mock('@/modules/skin/SkinContextRing', () => ({ default: () => null }));
vi.mock('@/modules/skin/SkinCompactBar', () => ({ default: () => null }));
vi.mock('@/modules/skin/SkinRecursos', () => ({ default: () => null }));
vi.mock('@/shared/context/ThemeContext', () => ({ useTheme: () => ({ isDarkMode: false, toggleDarkMode: () => {} }) }));
vi.mock('@/shared/api', () => ({ authenticatedFetch: vi.fn().mockResolvedValue({ ok: false }) }));

const project = { projectId: 'p', displayName: 'Proyecto', name: 'p', path: '/tmp/p', fullPath: '/tmp/p', sessions: [] } as unknown as Project;
const sesion = (cuenta?: string) => ({ id: 's1', title: 'Mi sesión', ...(cuenta ? { cuenta } : {}) }) as unknown as ProjectSession;

const renderHeader = (selectedSession: ProjectSession | null, onNewSessionWithCuenta = vi.fn()) =>
  render(
    <MemoryRouter>
      <SkinHeader
        activeTab="chat"
        setActiveTab={() => {}}
        selectedProject={project}
        selectedSession={selectedSession}
        shouldShowTasksTab={false}
        shouldShowBrowserTab={false}
        isMobile={false}
        onMenuClick={() => {}}
        onNewSessionWithCuenta={onNewSessionWithCuenta}
      />
    </MemoryRouter>,
  );

beforeEach(() => {
  reiniciarCuentaNueva();
  anilloMock.mockClear();
  avisoMock.mockClear();
});

describe('SkinHeader — cuenta de la sesión', () => {
  it('sesión personal: chip P y el anillo lee la cuota de personal', () => {
    renderHeader(sesion('personal'));

    expect(screen.getByTestId('account-chip').textContent).toBe('P');
    expect(screen.getByTestId('anillo').getAttribute('data-cuenta')).toBe('personal');
    expect(avisoMock).toHaveBeenCalledWith('personal');
  });

  it('sesión sin cuenta: chip O y anillo de optimum', () => {
    renderHeader(sesion());

    expect(screen.getByTestId('account-chip').textContent).toBe('O');
    expect(screen.getByTestId('anillo').getAttribute('data-cuenta')).toBe('optimum');
  });

  it('sin sesión abierta sigue a la cuenta elegida para la sesión nueva', () => {
    elegirCuentaNueva('personal');
    renderHeader(null);

    expect(screen.getByTestId('account-chip').getAttribute('data-cuenta')).toBe('personal');
    expect(screen.getByTestId('anillo').getAttribute('data-cuenta')).toBe('personal');
  });

  it('el aviso de tope abre una sesión nueva con la otra cuenta, vía la prop', () => {
    const onNew = vi.fn();
    renderHeader(sesion('personal'), onNew);

    fireEvent.click(screen.getByTestId('aviso-mock'));
    expect(onNew).toHaveBeenCalledWith('optimum');
  });
});
