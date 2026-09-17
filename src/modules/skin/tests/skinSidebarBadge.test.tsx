import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * El badge de estado (Fase 4 del plan del 17-sep) tiene que distinguirse a
 * simple vista entre 19+ sesiones apiladas: crece, se satura y suma un halo
 * (`ring`) propio de cada estado en vez de depender de un puntito de 6px, sin
 * dejar de ser un círculo — `skinSubagentRows.test.tsx` (Fase 5 del plan del
 * 15-sep) ya navega la fila con el selector `span.rounded-full` y cambiar la
 * forma de raíz le rompe la fila bajo los pies. La precedencia corriendo >
 * atención > seleccionada > quieta no cambió con el rediseño, solo el dibujo
 * — por eso hay un test de regresión aparte para eso.
 */

const buildSession = (id: string): ProjectSession =>
  ({
    id,
    title: `Sesión ${id}`,
    lastActivity: new Date().toISOString(),
  }) as unknown as ProjectSession;

const buildProject = (session: ProjectSession): Project =>
  ({
    projectId: 'proj-badge',
    displayName: 'Proyecto',
    name: 'proj-badge',
    path: '/tmp/proyecto',
    fullPath: '/tmp/proyecto',
    sessions: [session],
  }) as unknown as Project;

const renderBadge = (options: {
  session: ProjectSession;
  selectedSession?: ProjectSession | null;
  attentionSessionIds?: Set<string>;
  activeSessions?: ReadonlySet<string>;
}) => {
  const project = buildProject(options.session);
  render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={[project]}
          selectedProject={project}
          selectedSession={options.selectedSession ?? null}
          attentionSessionIds={options.attentionSessionIds}
          activeSessions={options.activeSessions}
          onProjectSelect={() => {}}
          onSessionSelect={() => {}}
          onNewSession={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );
  return screen.getByTestId('session-status-badge');
};

describe('SkinSidebar session status badge — los 4 estados', () => {
  it('"corriendo": círculo sólido celeste con pulso', () => {
    const session = buildSession('ses-running');
    const badge = renderBadge({ session, activeSessions: new Set([session.id]) });

    expect(badge.dataset.state).toBe('running');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('animate-pulse');
    expect(badge.className).toContain('bg-sky-500');
    expect(badge.outerHTML).toMatchSnapshot();
  });

  it('"atención": círculo sólido verde con halo', () => {
    const session = buildSession('ses-attention');
    const badge = renderBadge({ session, attentionSessionIds: new Set([session.id]) });

    expect(badge.dataset.state).toBe('attention');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('bg-emerald-500');
    expect(badge.className).toContain('ring-emerald-500/40');
    expect(badge.outerHTML).toMatchSnapshot();
  });

  it('"seleccionada": círculo sólido del color primario con halo', () => {
    const session = buildSession('ses-selected');
    const badge = renderBadge({ session, selectedSession: session });

    expect(badge.dataset.state).toBe('selected');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('bg-primary');
    expect(badge.className).toContain('ring-primary/40');
    expect(badge.outerHTML).toMatchSnapshot();
  });

  it('"quieta": círculo sólido gris apagado', () => {
    const session = buildSession('ses-idle');
    const badge = renderBadge({ session });

    expect(badge.dataset.state).toBe('idle');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('bg-muted-foreground/60');
    expect(badge.outerHTML).toMatchSnapshot();
  });
});

describe('SkinSidebar session status badge — regresión de precedencia', () => {
  it('corriendo gana sobre atención y seleccionada cuando las tres aplican', () => {
    const session = buildSession('ses-overlap-running');
    const badge = renderBadge({
      session,
      selectedSession: session,
      attentionSessionIds: new Set([session.id]),
      activeSessions: new Set([session.id]),
    });

    expect(badge.dataset.state).toBe('running');
  });

  it('atención gana sobre seleccionada cuando las dos aplican', () => {
    const session = buildSession('ses-overlap-attention');
    const badge = renderBadge({
      session,
      selectedSession: session,
      attentionSessionIds: new Set([session.id]),
    });

    expect(badge.dataset.state).toBe('attention');
  });
});
