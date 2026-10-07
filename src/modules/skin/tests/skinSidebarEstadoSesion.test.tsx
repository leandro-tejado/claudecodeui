import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SkinSidebar } from '@/modules/skin';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * Fase 11, paso 4 (boceto `05-octubre-header-barra.html`): pensando/esperando/
 * libre/dormida, aparte del badge de 5 estados de la Fase 4 del 17-sep
 * (`skinSidebarBadge.test.tsx`, que no se toca). Acá el rótulo va en el
 * `title` del ícono, no como texto fijo en la fila — la fila ya es densa.
 */

const buildSession = (
  id: string,
  lastActivity: string,
  tmux?: { nombre: string; vivo: boolean } | null,
): ProjectSession =>
  ({ id, title: `Sesión ${id}`, lastActivity, ...(tmux !== undefined && { tmux }) }) as unknown as ProjectSession;

const buildProject = (sessions: ProjectSession[]): Project =>
  ({
    projectId: 'proj-estado',
    displayName: 'Proyecto',
    name: 'proj-estado',
    path: '/tmp/proyecto',
    fullPath: '/tmp/proyecto',
    sessions,
  }) as unknown as Project;

const AHORA = new Date().toISOString();
const HACE_UNA_HORA = new Date(Date.now() - 60 * 60_000).toISOString();

const renderSidebar = (options: {
  sessions: ProjectSession[];
  attentionSessionIds?: Set<string>;
  activeSessions?: ReadonlySet<string>;
}) => {
  const project = buildProject(options.sessions);
  return render(
    <MemoryRouter>
      <UiPreferencesProvider>
        <SkinSidebar
          projects={[project]}
          selectedProject={project}
          selectedSession={null}
          attentionSessionIds={options.attentionSessionIds}
          activeSessions={options.activeSessions}
          onProjectSelect={() => {}}
          onSessionSelect={() => {}}
          onNewSession={() => {}}
        />
      </UiPreferencesProvider>
    </MemoryRouter>,
  );
};

describe('SkinSidebar — rótulo de estado de sesión del boceto (Fase 11, paso 4)', () => {
  it('corriendo se marca "pensando"', () => {
    const session = buildSession('ses-pensando', AHORA);
    renderSidebar({ sessions: [session], activeSessions: new Set([session.id]) });

    expect(screen.getByTitle(/^pensando: /)).toBeTruthy();
  });

  it('con atención pendiente se marca "esperando"', () => {
    const session = buildSession('ses-esperando', AHORA);
    renderSidebar({ sessions: [session], attentionSessionIds: new Set([session.id]) });

    expect(screen.getByTitle(/^esperando: /)).toBeTruthy();
  });

  it('tocada hace menos de 10 min, sin trabajo ni atención, se marca "libre"', () => {
    const session = buildSession('ses-libre', AHORA);
    renderSidebar({ sessions: [session] });

    expect(screen.getByTitle(/^libre: /)).toBeTruthy();
  });

  it('sin tocar hace más de 10 min se marca "dormida"', () => {
    const session = buildSession('ses-dormida', HACE_UNA_HORA);
    renderSidebar({ sessions: [session] });

    expect(screen.getByTitle(/^dormida: /)).toBeTruthy();
  });
});

/*
 * Bug del 07-oct, sesión 4e7d7ee3 / tmux cloudcli-workspace-leandro-a854fb85:
 * el servidor ya mandaba `tmux: { vivo: true }` (el registro la da "viva",
 * terminó su turno y quedó esperando), pero la barra la marcaba "dormida"
 * porque su último cambio era de hacía 46 min.
 */
describe('SkinSidebar — estado con tmux (bug 07-oct, "dormida" con el tmux vivo)', () => {
  const renderProyecto = (sessions: ProjectSession[]) => {
    const project = buildProject(sessions);
    return (
      <MemoryRouter>
        <UiPreferencesProvider>
          <SkinSidebar
            projects={[project]}
            selectedProject={project}
            selectedSession={null}
            onProjectSelect={() => {}}
            onSessionSelect={() => {}}
            onNewSession={() => {}}
          />
        </UiPreferencesProvider>
      </MemoryRouter>
    );
  };

  it('tmux vivo y sin tocar hace una hora: "libre", no "dormida"', () => {
    const session = buildSession('4e7d7ee3', HACE_UNA_HORA, {
      nombre: 'cloudcli-workspace-leandro-a854fb85',
      vivo: true,
    });
    render(renderProyecto([session]));

    expect(screen.getByTitle(/^libre: /)).toBeTruthy();
    expect(screen.queryByTitle(/^dormida: /)).toBeNull();
  });

  it('cambia en vivo cuando el pane muere, sin recargar', () => {
    const viva = buildSession('ses-tmux', AHORA, { nombre: 'proj-chat-1', vivo: true });
    const { rerender } = render(renderProyecto([viva]));
    expect(screen.getByTitle(/^libre: /)).toBeTruthy();

    // Con el filtro "solo tmux vivo" (el de por defecto), la fila sale.
    const muerta = buildSession('ses-tmux', AHORA, { nombre: 'proj-chat-1', vivo: false });
    rerender(renderProyecto([muerta]));
    expect(screen.queryByText('Sesión ses-tmux')).toBeNull();

    // Mostrando todas, queda "dormida" aunque se haya tocado recién.
    fireEvent.click(screen.getByTitle(/click para ver todas/));
    expect(screen.getByText('Sesión ses-tmux')).toBeTruthy();
    expect(screen.getByTitle(/^dormida: /)).toBeTruthy();
  });
});

describe('SkinSidebar — entrada animada de una fila nueva (Fase 11, paso 4)', () => {
  it('una sesión que aparece después de la carga inicial entra con `.ds-fila-nueva`', () => {
    const s1 = buildSession('s1', AHORA);
    const s2 = buildSession('s2', AHORA);
    const project = buildProject([s1, s2]);

    const { rerender } = render(
      <MemoryRouter>
        <UiPreferencesProvider>
          <SkinSidebar
            projects={[project]}
            selectedProject={project}
            selectedSession={null}
            onProjectSelect={() => {}}
            onSessionSelect={() => {}}
            onNewSession={() => {}}
          />
        </UiPreferencesProvider>
      </MemoryRouter>,
    );

    // La carga inicial no anima nada.
    expect(document.querySelector('.ds-fila-nueva')).toBeNull();

    const s3 = buildSession('s3', AHORA);
    const projectConNueva = buildProject([s1, s2, s3]);
    rerender(
      <MemoryRouter>
        <UiPreferencesProvider>
          <SkinSidebar
            projects={[projectConNueva]}
            selectedProject={projectConNueva}
            selectedSession={null}
            onProjectSelect={() => {}}
            onSessionSelect={() => {}}
            onNewSession={() => {}}
          />
        </UiPreferencesProvider>
      </MemoryRouter>,
    );

    const filasNuevas = document.querySelectorAll('.ds-fila-nueva');
    expect(filasNuevas.length).toBe(1);
    expect(screen.getByText('Sesión s3').closest('.ds-fila-nueva')).toBeTruthy();
  });
});
