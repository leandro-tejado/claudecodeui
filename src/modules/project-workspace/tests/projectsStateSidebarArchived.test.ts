import assert from 'node:assert/strict';

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { Project, ProjectSession } from '@/shared/types';

/**
 * El delta `sidebar_archived` saca proyectos y sesiones de la barra en el
 * lugar: sin volver a pedir `/api/projects` y sin cerrar lo que está abierto.
 */

const projectsResponse = vi.fn();

vi.mock('@/shared/api', () => ({
  api: {
    projects: () => projectsResponse(),
    projectTaskmaster: () => Promise.resolve({ ok: false }),
    sessionDetails: () => Promise.resolve({ ok: false }),
    projectSessions: () => Promise.resolve({ ok: false }),
  },
}));

const buildProject = (projectId: string, sessionIds: string[]): Project => ({
  projectId,
  path: `/${projectId}`,
  fullPath: `/${projectId}`,
  displayName: projectId,
  isStarred: false,
  sessions: sessionIds.map((id) => ({ id, summary: id }) as ProjectSession),
  sessionMeta: { hasMore: false, total: sessionIds.length },
});

type ServerEventListener = (event: Record<string, unknown>) => void;

const listeners = new Set<ServerEventListener>();

const emit = (event: Record<string, unknown>) => {
  for (const listener of listeners) {
    listener(event);
  }
};

const archived = (projectIds: string[], sessionIds: string[]) => ({
  kind: 'sidebar_archived',
  projectIds,
  sessionIds,
  timestamp: '2026-01-01T00:00:00.000Z',
});

const renderProjectsState = async (urlSessionId?: string) => {
  const { useProjectsState } = await import(
    '@/modules/project-workspace/hooks/useProjectsState'
  );

  return renderHook(() =>
    useProjectsState({
      sessionId: urlSessionId,
      navigate: vi.fn() as never,
      subscribe: (listener: ServerEventListener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      isMobile: false,
      isSessionProcessing: () => false,
    }),
  );
};

const loadProjects = async (projects: Project[], urlSessionId?: string) => {
  projectsResponse.mockResolvedValue({ ok: true, json: async () => projects });
  const rendered = await renderProjectsState(urlSessionId);
  await waitFor(() => {
    assert.equal(rendered.result.current.projects.length, projects.length);
  });
  return rendered;
};

beforeEach(() => {
  localStorage.clear();
  projectsResponse.mockReset();
  listeners.clear();
});

afterEach(() => {
  vi.resetModules();
});

test('un proyecto y una sesión archivados salen de la lista sin volver a pedirla', async () => {
  const { result } = await loadProjects([
    buildProject('proyecto-a', ['a1', 'a2']),
    buildProject('proyecto-b', ['b1']),
    buildProject('proyecto-c', ['c1', 'c2']),
  ]);
  const fetchesBefore = projectsResponse.mock.calls.length;

  await act(async () => {
    emit(archived(['proyecto-b'], ['a2']));
  });

  assert.deepEqual(result.current.projects.map((project) => project.projectId), ['proyecto-a', 'proyecto-c']);
  assert.deepEqual(
    (result.current.projects[0]?.sessions ?? []).map((session) => session.id),
    ['a1'],
  );
  assert.equal(result.current.projects[0]?.sessionMeta?.total, 1, 'el total baja con la sesión que se fue');
  assert.deepEqual(
    (result.current.projects[1]?.sessions ?? []).map((session) => session.id),
    ['c1', 'c2'],
    'las sesiones de otro proyecto no se tocan',
  );
  assert.equal(projectsResponse.mock.calls.length, fetchesBefore, 'no vuelve a pedir /api/projects');
});

test('la sesión abierta sale de la lista pero no se cierra', async () => {
  const { result } = await loadProjects([buildProject('proyecto-a', ['a1', 'a2'])], 'a1');

  await waitFor(() => {
    assert.equal(result.current.selectedSession?.id, 'a1');
  });

  await act(async () => {
    emit(archived([], ['a1']));
  });

  assert.deepEqual(
    (result.current.projects[0]?.sessions ?? []).map((session) => session.id),
    ['a2'],
  );
  assert.equal(result.current.selectedSession?.id, 'a1', 'la vista abierta sigue en su sesión');
  assert.equal(result.current.selectedProject?.projectId, 'proyecto-a');
});

test('un delta sin nada que sacar deja la lista tal cual', async () => {
  const { result } = await loadProjects([buildProject('proyecto-a', ['a1'])]);
  const before = result.current.projects;

  await act(async () => {
    emit(archived([], []));
    emit(archived(['no-existe'], ['tampoco']));
  });

  assert.equal(result.current.projects, before, 'misma referencia: no hay re-render de la barra');
});
