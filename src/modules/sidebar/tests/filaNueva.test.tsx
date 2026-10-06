import assert from 'node:assert/strict';

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test, vi } from 'vitest';

import type { Project, SidebarProjectListProps } from '@/shared/types';

/**
 * Fase 11, paso 4 (boceto `05-octubre-header-barra.html`): una sesión que
 * aparece DESPUÉS de la carga inicial (la crea `ct`, el orquestador, u otra
 * pestaña — Fase 8) entra con la animación de "fila nueva"; la carga inicial
 * misma no anima nada, y una sesión ya vista no vuelve a animarse en un
 * render posterior.
 */

const recordedSessionRowProps: Record<string, unknown>[] = [];

vi.mock('@/modules/sidebar/SidebarSessionItem', () => ({
  default: (props: Record<string, unknown>) => {
    recordedSessionRowProps.push(props);
    return null;
  },
}));

const { default: SidebarProjectSessions } = await import('@/modules/sidebar/SidebarProjectSessions');
const { getAllSessions } = await import('@/modules/sidebar/utils/sidebarProjectFormatting');

const noop = () => {};
const t = ((key: string) => key) as unknown as SidebarProjectListProps['t'];
const NOW = new Date('2026-10-06T10:00:00.000Z');
const NO_IDS: ReadonlySet<string> = new Set<string>();

const project = (sessionIds: string[]): Project => ({
  projectId: 'p1',
  name: 'p1',
  displayName: 'p1',
  fullPath: '/tmp/p1',
  sessions: sessionIds.map((id) => ({ id, summary: id, lastActivity: '2026-10-06T09:59:00.000Z' })),
}) as unknown as Project;

const baseProps = (proj: Project) => ({
  project: proj,
  isExpanded: true,
  sessions: getAllSessions(proj),
  selectedSession: null,
  initialSessionsLoaded: true,
  hasMoreSessions: false,
  isLoadingMoreSessions: false,
  activeSessions: NO_IDS,
  backgroundSessionIds: NO_IDS,
  attentionSessionIds: NO_IDS,
  currentTime: NOW,
  sessionRenameId: null,
  sessionRenameDraft: '',
  onRenameDraftChange: noop,
  onStartEditingSession: noop,
  onCancelEditingSession: noop,
  onSaveEditingSession: noop,
  onProjectSelect: noop,
  onSessionSelect: noop,
  onDeleteSession: noop,
  onLoadMoreSessions: noop,
  onNewSession: noop,
  t,
});

beforeEach(() => {
  recordedSessionRowProps.length = 0;
});

test('la carga inicial no marca ninguna fila como nueva', () => {
  render(React.createElement(SidebarProjectSessions, baseProps(project(['s1', 's2']))));

  assert.deepEqual(recordedSessionRowProps.map((p) => p.isNueva), [false, false]);
});

test('una sesión que aparece después de la carga inicial se marca nueva una sola vez', async () => {
  const proj1 = project(['s1', 's2']);
  const { rerender } = render(React.createElement(SidebarProjectSessions, baseProps(proj1)));
  recordedSessionRowProps.length = 0;

  const proj2 = project(['s1', 's2', 's3']);
  rerender(React.createElement(SidebarProjectSessions, baseProps(proj2)));

  const porId = (id: string) => recordedSessionRowProps.find((p) => (p.session as { id: string }).id === id);
  assert.equal(porId('s1')?.isNueva, false);
  assert.equal(porId('s2')?.isNueva, false);
  assert.equal(porId('s3')?.isNueva, true, 's3 apareció después de la carga inicial');

  // Deja que el effect post-commit registre "s3" como ya vista.
  await Promise.resolve();
  recordedSessionRowProps.length = 0;
  rerender(React.createElement(SidebarProjectSessions, baseProps(project(['s1', 's2', 's3']))));

  assert.equal(
    recordedSessionRowProps.find((p) => (p.session as { id: string }).id === 's3')?.isNueva,
    false,
    'una fila ya mostrada no vuelve a animarse en el siguiente render',
  );
});
