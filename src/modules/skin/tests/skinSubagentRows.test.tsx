import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { resetSubagentStoreForTests, upsertSubagent } from '@/modules/skin/subagentStore';
import { publishSessionBudget, resetSessionBudgetStoreForTests } from '@/modules/skin/sessionBudgetStore';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project } from '@/shared/types';

/*
 * Las filas hijas de los subagentes VIVOS, y el cuarto estado del punto.
 *
 * Dos cosas distintas que comparten el mismo bloque de código. Las filas hijas
 * salen del store del chat y desaparecen solas cuando el subagente termina: no
 * son sesiones, no navegan, y por eso no pueden ser anclas. El cuarto estado es
 * lo que el rediseño había perdido — `attentionSessionIds` significa "pasó algo
 * mientras mirabas otra sesión", no "está trabajando", y sin distinguirlos no
 * había forma de saber cuál está corriendo.
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

const session = (id: string, title: string) => ({
  id,
  title,
  lastActivity: new Date('2026-09-15T12:00:00Z').toISOString(),
});

const renderSidebar = (options: {
  sessions: Record<string, unknown>[];
  activeSessions?: Set<string>;
  attentionSessionIds?: Set<string>;
  selectedId?: string;
}) => {
  const project = buildProject(options.sessions);
  const selected = options.selectedId
    ? options.sessions.find((s) => s.id === options.selectedId)
    : null;
  return render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={[project]}
          selectedProject={project}
          selectedSession={(selected ?? null) as never}
          activeSessions={options.activeSessions}
          attentionSessionIds={options.attentionSessionIds}
          onProjectSelect={() => {}}
          onSessionSelect={vi.fn()}
          onNewSession={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );
};

/** El punto de actividad de una fila: el primer `<span>` redondo del ancla. */
const dotOf = (container: HTMLElement, sessionId: string): Element | null =>
  container.querySelector(`a[href$="/${sessionId}"] span.rounded-full`);

afterEach(() => {
  resetSubagentStoreForTests();
  resetSessionBudgetStoreForTests();
});

describe('filas hijas de subagentes vivos', () => {
  it('dos subagentes vivos dan dos filas hijas bajo su sesión', () => {
    upsertSubagent({ toolUseId: 'toolu_a', sessionId: 'ses-1', type: 'dev', description: 'revisar el store', model: 'claude-sonnet-5' });
    upsertSubagent({ toolUseId: 'toolu_b', sessionId: 'ses-1', type: 'Explore', description: 'barrer los tests', model: 'claude-sonnet-5' });

    renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    expect(screen.getByText('dev')).toBeTruthy();
    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.getByRole('group', { name: /Subagentes en curso/ }).children).toHaveLength(2);
  });

  it('la sangría las deja visiblemente por dentro de la sesión', () => {
    upsertSubagent({ toolUseId: 'toolu_a', sessionId: 'ses-1', type: 'dev', description: 'x' });
    renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    // El mismo recurso con que el árbol ya indenta las sesiones bajo su proyecto.
    const nest = screen.getByRole('group', { name: /Subagentes en curso/ });
    expect(nest.className).toContain('ml-[19px]');
    expect(nest.className).toContain('border-l');
    expect(nest?.textContent).toContain('dev');
  });

  it('la fila hija no es un ancla y no navega', () => {
    upsertSubagent({ toolUseId: 'toolu_a', sessionId: 'ses-1', type: 'dev', description: 'x' });
    const { container } = renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    const row = screen.getByText('dev').closest('div');
    expect(row?.tagName).toBe('DIV');
    expect(row?.closest('a')).toBeNull();
    // Una sola ancla en el árbol: la de la sesión.
    expect(container.querySelectorAll('a[href*="ses-1"]')).toHaveLength(1);
  });

  it('nunca inventa un modelo: sin dato, la raya', () => {
    upsertSubagent({ toolUseId: 'toolu_a', sessionId: 'ses-1', type: 'dev', description: 'x' });
    renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('el estado de la fila hija se lee del store, con el pulso solo en las que corren', () => {
    upsertSubagent({ toolUseId: 'toolu_a', sessionId: 'ses-1', type: 'dev', description: 'x', status: 'running' });
    upsertSubagent({ toolUseId: 'toolu_b', sessionId: 'ses-1', type: 'Plan', description: 'y', status: 'failed' });
    renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    const nest = screen.getByRole('group', { name: /Subagentes en curso/ });
    expect(nest.querySelector('.bg-purple-500.animate-pulse')).toBeTruthy();
    expect(nest.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('una sesión sin subagentes no dibuja ningún nivel extra', () => {
    renderSidebar({ sessions: [session('ses-1', 'Sesión quieta')] });

    expect(screen.queryByRole('group', { name: /Subagentes en curso/ })).toBeNull();
  });

  it('el título trunca en vez de desbordar cuando la fila es angosta', () => {
    upsertSubagent({ toolUseId: 'toolu_a', sessionId: 'ses-1', type: 'un-agente-con-nombre-larguisimo', description: 'x' });
    const { container } = renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    const label = screen.getByText('un-agente-con-nombre-larguisimo');
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('min-w-0');
    expect(container.querySelector('a span.truncate')).toBeTruthy();
  });
});

describe('el cuarto estado del punto de actividad', () => {
  it('una sesión con una corrida en vuelo se ve corriendo, no como las demás', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Corriendo'), session('ses-2', 'Quieta')],
      activeSessions: new Set(['ses-1']),
    });

    expect(dotOf(container, 'ses-1')?.className).toContain('animate-pulse');
    expect(dotOf(container, 'ses-2')?.className).not.toContain('animate-pulse');
    expect(dotOf(container, 'ses-1')?.getAttribute('title')).toBe('Corriendo ahora');
  });

  it('corriendo no se confunde con el verde de atención', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Corriendo'), session('ses-2', 'Te espera')],
      activeSessions: new Set(['ses-1']),
      attentionSessionIds: new Set(['ses-2']),
    });

    expect(dotOf(container, 'ses-1')?.className).not.toContain('bg-emerald-500');
    expect(dotOf(container, 'ses-2')?.className).toContain('bg-emerald-500');
  });

  it('la precedencia es corriendo > atención > seleccionada', () => {
    // La misma sesión en los tres conjuntos a la vez: gana corriendo.
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Las tres cosas')],
      activeSessions: new Set(['ses-1']),
      attentionSessionIds: new Set(['ses-1']),
      selectedId: 'ses-1',
    });

    const dot = dotOf(container, 'ses-1');
    expect(dot?.className).toContain('bg-sky-500');
    expect(dot?.className).not.toContain('bg-emerald-500');
    expect(dot?.className).not.toContain('bg-primary');
  });

  it('sin el dato de corridas, el sidebar se comporta igual que antes', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Quieta')],
      attentionSessionIds: new Set(['ses-1']),
    });

    expect(dotOf(container, 'ses-1')?.className).toContain('bg-emerald-500');
  });
});

describe('el anillo de compactación', () => {
  it('una sesión al 90% de su presupuesto muestra el tramo ámbar sin estar seleccionada', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Cerca de compactar')],
    });
    act(() => publishSessionBudget('ses-1', { inputTokens: 220_500, compactAt: 245_000 }));

    expect(dotOf(container, 'ses-1')?.className).toContain('outline-amber-500');
  });

  it('arriba del 95% pasa a rojo', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Casi al tope')],
    });
    act(() => publishSessionBudget('ses-1', { inputTokens: 235_000, compactAt: 245_000 }));

    expect(dotOf(container, 'ses-1')?.className).toContain('outline-red-500');
  });

  it('por debajo del tramo ámbar no dibuja el anillo', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Recién empezando')],
    });
    act(() => publishSessionBudget('ses-1', { inputTokens: 50_000, compactAt: 245_000 }));

    const className = dotOf(container, 'ses-1')?.className ?? '';
    expect(className).not.toContain('outline-amber-500');
    expect(className).not.toContain('outline-red-500');
  });

  it('sin compactAt no dibuja el anillo, no inventa un 0%', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Sin umbral')],
    });
    act(() => publishSessionBudget('ses-1', { inputTokens: 220_500 }));

    const className = dotOf(container, 'ses-1')?.className ?? '';
    expect(className).not.toContain('outline-amber-500');
    expect(className).not.toContain('outline-red-500');
  });

  it('sigue siendo un solo punto por fila, no dos', () => {
    const { container } = renderSidebar({
      sessions: [session('ses-1', 'Cerca de compactar')],
    });
    act(() => publishSessionBudget('ses-1', { inputTokens: 220_500, compactAt: 245_000 }));

    expect(container.querySelectorAll(`a[href$="/ses-1"] span.rounded-full`)).toHaveLength(1);
  });
});

describe('la edad de la sesión', () => {
  it('el tooltip dice qué mide el número, que hasta ahora no lo decía', () => {
    renderSidebar({ sessions: [session('ses-1', 'Sesión principal')] });

    const age = screen.getByTitle(/Último turno escrito hace/);
    expect(age.textContent?.trim().length).toBeGreaterThan(0);
  });
});
