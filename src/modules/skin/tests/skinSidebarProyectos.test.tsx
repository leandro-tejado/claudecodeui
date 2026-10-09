import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { monograma, peorEstadoDe } from '@/modules/skin/SkinSidebar';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project } from '@/shared/types';

/* Rediseño 09-oct, Fase 8: cada proyecto con su monograma y, plegado, el contador y el estado más urgente. */

const proyecto = (id: string, nombre: string, sesiones: Record<string, unknown>[]): Project =>
  ({ projectId: id, displayName: nombre, name: id, path: `/tmp/${id}`, fullPath: `/tmp/${id}`, sessions: sesiones }) as unknown as Project;

const sesion = (id: string, vivo: boolean | null) => ({
  id,
  title: `Sesión ${id}`,
  lastActivity: new Date('2026-01-01T00:00:00Z').toISOString(),
  tmux: vivo === null ? null : { nombre: `t-${id}`, vivo },
});

const renderBarra = (projects: Project[], extra: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={projects}
          selectedProject={null}
          selectedSession={null}
          onProjectSelect={() => {}}
          onSessionSelect={() => {}}
          onNewSession={() => {}}
          {...extra}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );

describe('monograma y peor estado', () => {
  it('el monograma toma las iniciales de dos palabras o las dos primeras letras', () => {
    expect(monograma('app optimum mkt')).toBe('AO');
    expect(monograma('cloudcli')).toBe('CL');
    expect(monograma('servidor-code')).toBe('SC');
  });

  it('esperando gana sobre pensando y libre; las dormidas no cuentan', () => {
    expect(peorEstadoDe(['libre', 'esperando', 'pensando'])).toBe('esperando');
    expect(peorEstadoDe(['libre', 'pensando'])).toBe('pensando');
    expect(peorEstadoDe(['dormida', 'dormida'])).toBeNull();
    expect(peorEstadoDe([])).toBeNull();
  });
});

describe('fila del proyecto plegado', () => {
  it('muestra monograma, contador y el estado más urgente de sus sesiones', () => {
    renderBarra([proyecto('p1', 'app optimum', [sesion('a', false), sesion('b', true)])]);
    expect(screen.getByTestId('proyecto-monograma').textContent).toBe('AO');
    expect(screen.getByTestId('proyecto-contador').textContent).toBe('2');
    expect(screen.getByTestId('proyecto-peor-estado').getAttribute('data-estado')).toBe('libre');
  });

  it('con una sesión corriendo, el proyecto plegado se marca pensando', () => {
    renderBarra([proyecto('p1', 'app optimum', [sesion('a', true), sesion('b', false)])], { activeSessions: new Set(['b']) });
    expect(screen.getByTestId('proyecto-peor-estado').getAttribute('data-estado')).toBe('pensando');
  });

  it('todas dormidas: sin punto de estado', () => {
    renderBarra([proyecto('p1', 'app optimum', [sesion('a', false)])]);
    expect(screen.queryByTestId('proyecto-peor-estado')).toBeNull();
  });
});
