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
  it('ya no existe (rediseño 09-oct): se ven todas, sin interruptor ni contador', () => {
    renderSidebar([
      session('ses-1', 'Con tmux', { nombre: 'cloudcli-proj-abc', vivo: true }),
      session('ses-2', 'Sin tmux', null),
      session('ses-3', 'Tmux caído', { nombre: 'cloudcli-proj-def', vivo: false }),
    ]);

    expect(screen.getByText('Con tmux')).toBeTruthy();
    expect(screen.getByText('Sin tmux')).toBeTruthy();
    expect(screen.getByText('Tmux caído')).toBeTruthy();
    expect(screen.queryByTitle(/sesiones con tmux vivo|filtrar solo tmux/)).toBeNull();
    expect(screen.queryByText(/ocultas/)).toBeNull();
  });

  it('sin registro (todas las sesiones en null) no deja el sidebar vacío', () => {
    renderSidebar([session('ses-1', 'Sin dato de tmux', null), session('ses-2', 'Tampoco', null)]);

    expect(screen.getByText('Sin dato de tmux')).toBeTruthy();
    expect(screen.getByText('Tampoco')).toBeTruthy();
    expect(screen.queryByText(/ocultas/)).toBeNull();
  });
});

describe('chip de cuenta en la fila (Fase 3 de 06-octubre-vps-multi-cuenta)', () => {
  const conCuenta = (id: string, title: string, cuenta: string | undefined, vivo = true) => ({
    ...session(id, title, { nombre: `cloudcli-${id}`, vivo }),
    ...(cuenta ? { cuenta } : {}),
  });

  it('una sesión de tmux de la cuenta personal muestra el chip P', () => {
    renderSidebar([conCuenta('ses-1', 'Trabajo propio', 'personal')]);

    const fila = screen.getByText('Trabajo propio').closest('a') as HTMLElement;
    const chip = fila.querySelector('[data-testid="account-chip"]');
    expect(chip?.textContent).toBe('P');
    expect(chip?.getAttribute('data-cuenta')).toBe('personal');
    expect(fila.querySelector('[title="tmux: cloudcli-ses-1"]')).not.toBeNull();
  });

  it('sin campo cuenta la fila es de optimum: chip O', () => {
    renderSidebar([conCuenta('ses-1', 'Trabajo de Optimum', undefined)]);

    const chip = screen.getByTestId('account-chip');
    expect(chip.textContent).toBe('O');
    expect(chip.getAttribute('data-cuenta')).toBe('optimum');
  });

  it('cada fila lleva el chip de su propia cuenta', () => {
    renderSidebar([
      conCuenta('ses-1', 'Una', 'personal'),
      conCuenta('ses-2', 'Otra', 'optimum'),
    ]);

    expect(screen.getAllByTestId('account-chip').map((c) => c.getAttribute('data-cuenta'))).toEqual(['personal', 'optimum']);
  });
});
