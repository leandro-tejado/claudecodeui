import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { useSkinUi } from '@/modules/skin/skinUiStore';
import { api } from '@/shared/api';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * Sidebar del rediseño propio — boceto A.
 *
 * Sustituye a `@/modules/sidebar` desde un único punto de injerto en
 * ProjectSidebarRegion. Consume el mismo `sidebarSharedProps` que el sidebar
 * de upstream, así que no duplica lógica de estado: sólo presenta.
 *
 * Qué cambia respecto del de upstream:
 * - Una sola lista. Desaparece el par Proyectos / Conversaciones, que eran el
 *   mismo contenido en dos modos y no se entendía cuál era cuál.
 * - Sin badge de GitHub (que además pegaba a api.github.com en cada carga),
 *   sin "Informar de un problema" y sin "Unirse a la comunidad".
 * - El borde derecho es una manija de arrastre real, con el ancho persistido.
 * - Escala compacta: la densidad sale de los tokens `--skin-*`.
 *
 * Los textos van en español directo y no por i18n: es una instancia personal
 * de un solo usuario. Si algún día se comparte, hay que pasarlos a `t()`.
 */

const WIDTH_STORAGE_KEY = 'skin:sidebar-width';

type SkinSidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  attentionSessionIds?: Set<string> | string[];
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: ProjectSession) => void;
  onNewSession: (project: Project) => void;
  onSessionDelete?: (sessionId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onLoadMoreSessions?: (projectId: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
  onShowSettings?: () => void;
  isMobile?: boolean;
};

/** Devuelve "ahora", "3h" o "6d" — la edad en el ancho mínimo que se entiende. */
const formatAge = (session: ProjectSession): string => {
  const raw =
    session.lastActivity ??
    session.updated_at ??
    session.createdAt ??
    session.created_at;
  if (!raw) return '';

  const then = new Date(raw as string).getTime();
  if (!Number.isFinite(then)) return '';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 2) return 'ahora';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;

  return `${Math.round(days / 30)}me`;
};

const sessionTitle = (session: ProjectSession): string =>
  (session.title || session.summary || session.name || 'Sesión sin título') as string;

/** El proyecto viene con la ruta completa; en el sidebar sólo cabe el final. */
const shortPath = (project: Project): string => {
  const full = project.fullPath || project.path || '';
  if (!full) return '';
  const parts = full.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? full : `…/${parts.slice(-2).join('/')}`;
};

const readStoredWidth = (): number => {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 200 && parsed <= 520) {
      return parsed;
    }
  } catch {
    // Storage bloqueado (ventana privada, permisos): el default alcanza.
  }
  return 272;
};

export function SkinSidebar({
  projects,
  selectedProject,
  selectedSession,
  attentionSessionIds,
  onProjectSelect,
  onSessionSelect,
  onNewSession,
  onSessionDelete,
  onProjectDelete,
  onLoadMoreSessions,
  isLoading,
  onRefresh,
  onShowSettings,
  isMobile,
}: SkinSidebarProps) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [width, setWidth] = useState(readStoredWidth);
  const [starOverride, setStarOverride] = useState<Map<string, boolean>>(new Map());
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { sidebarCollapsed } = useSkinUi();

  /* Renombrar una sesión, en el lugar. `titleOverride` evita esperar a que el
     backend reindexe para ver el nombre nuevo en la fila. */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [titleOverride, setTitleOverride] = useState<Map<string, string>>(new Map());

  const commitRename = useCallback(
    async (sessionId: string) => {
      const trimmed = renameValue.trim();
      setRenamingId(null);
      if (!trimmed) return;

      setTitleOverride((previous) => new Map(previous).set(sessionId, trimmed));
      try {
        const response = await api.renameSession(sessionId, trimmed);
        if (!response.ok) throw new Error('rename failed');
      } catch {
        // Se revierte el nombre optimista: mostrar uno que el servidor no
        // guardó es peor que no haber cambiado nada.
        setTitleOverride((previous) => {
          const next = new Map(previous);
          next.delete(sessionId);
          return next;
        });
      }
    },
    [renameValue],
  );

  /* Apertura de proyectos.
   *
   * El proyecto seleccionado se abre solo: entrar a una sesión y no ver dónde
   * vive es justamente lo que hacía confusa la lista anterior. Eso se DERIVA en
   * el render (`openOverride.get(id) ?? isCurrent`) en lugar de sincronizarse
   * con un efecto: un `setState` dentro de un `useEffect` dispara un render
   * extra y, acá, no aporta nada que no se pueda calcular.
   *
   * El Map guarda sólo las decisiones explícitas del usuario. Un proyecto que
   * cerraste a mano queda cerrado aunque lo selecciones; uno que nunca tocaste
   * sigue al proyecto activo. */
  const [openOverride, setOpenOverride] = useState<Map<string, boolean>>(new Map());

  /* --- Arrastre del ancho. Los listeners viven en window porque el puntero
     se escapa del handle apenas empieza a moverse. --- */
  const handleDragStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStateRef.current = { startX: event.clientX, startWidth: width };

      const onMove = (moveEvent: MouseEvent) => {
        const drag = dragStateRef.current;
        if (!drag) return;
        const next = Math.min(520, Math.max(200, drag.startWidth + (moveEvent.clientX - drag.startX)));
        setWidth(next);
      };

      const onUp = () => {
        dragStateRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Se persiste al soltar, no en cada píxel.
        setWidth((current) => {
          try {
            localStorage.setItem(WIDTH_STORAGE_KEY, String(current));
          } catch {
            // Sin storage el ancho dura lo que la pestaña. No es motivo de error.
          }
          return current;
        });
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width],
  );

  const isStarred = useCallback(
    (project: Project) => starOverride.get(project.projectId) ?? Boolean(project.isStarred),
    [starOverride],
  );

  const toggleStar = useCallback(
    async (project: Project) => {
      const next = !isStarred(project);
      // Optimista: la estrella responde al click y se corrige si el server discrepa.
      setStarOverride((previous) => new Map(previous).set(project.projectId, next));
      try {
        const response = await api.toggleProjectStar(project.projectId);
        if (!response.ok) throw new Error('toggle failed');
        const payload = (await response.json()) as { isStarred?: boolean };
        setStarOverride((previous) =>
          new Map(previous).set(project.projectId, Boolean(payload.isStarred)),
        );
      } catch {
        setStarOverride((previous) => new Map(previous).set(project.projectId, !next));
      }
    },
    [isStarred],
  );

  const attention = useMemo(() => {
    if (!attentionSessionIds) return new Set<string>();
    return attentionSessionIds instanceof Set
      ? attentionSessionIds
      : new Set(attentionSessionIds);
  }, [attentionSessionIds]);

  /* Filtro y orden. Buscar mira el proyecto y también sus sesiones, así que
     escribir el tema de una conversación encuentra la carpeta donde vive. */
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = projects
      .map((project) => {
        if (!needle) return { project, sessions: project.sessions ?? [] };

        const projectHit = project.displayName?.toLowerCase().includes(needle);
        const sessions = (project.sessions ?? []).filter((session) =>
          sessionTitle(session).toLowerCase().includes(needle),
        );
        if (!projectHit && sessions.length === 0) return null;
        return { project, sessions: projectHit ? project.sessions ?? [] : sessions };
      })
      .filter((entry): entry is { project: Project; sessions: ProjectSession[] } => entry !== null);

    return matched.sort((a, b) => {
      const starDelta = Number(isStarred(b.project)) - Number(isStarred(a.project));
      if (starDelta !== 0) return starDelta;
      return (a.project.displayName || '').localeCompare(b.project.displayName || '');
    });
  }, [projects, query, isStarred]);

  const toggleExpanded = useCallback((projectId: string, isOpenNow: boolean) => {
    setOpenOverride((previous) => new Map(previous).set(projectId, !isOpenNow));
  }, []);

  const rowStyle: CSSProperties = {
    padding: 'var(--skin-row-y) var(--skin-row-x)',
    gap: 'var(--skin-gap)',
    fontSize: 'var(--skin-text-sm)',
  };

  const isCollapsed = !isMobile && sidebarCollapsed;

  return (
    /* Dos capas a propósito: la de afuera anima el ancho (y lo lleva a 0 al
       colapsar), la de adentro conserva el ancho real. Sin esa separación el
       contenido se comprimiría durante la animación en vez de deslizarse. */
    <div
      className="relative h-full flex-none overflow-hidden bg-card transition-[width] duration-200 ease-out"
      style={{ width: isMobile ? '100%' : isCollapsed ? 0 : width, fontSize: 'var(--skin-text)' }}
    >
      <div
        className="flex h-full flex-col"
        style={{ width: isMobile ? '100%' : width }}
        aria-hidden={isCollapsed}
      >
      {/* Manija de ancho. En mobile el sidebar es un cajón: no aplica. */}
      {!isMobile && !isCollapsed && (
        <div
          onMouseDown={handleDragStart}
          className="group absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ajustar el ancho del panel"
        >
          <div className="ml-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary" />
        </div>
      )}

      {/* --- Cabecera --- */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="grid h-6 w-6 flex-none place-items-center rounded-md bg-foreground text-[11px] font-semibold text-background">
          LT
        </div>
        <span className="truncate font-semibold tracking-tight">Consola</span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => !open);
              if (searchOpen) setQuery('');
            }}
            title="Buscar"
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground ${
              searchOpen ? 'bg-accent text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            title="Actualizar"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => selectedProject && onNewSession(selectedProject)}
            title="Nueva sesión"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* --- Búsqueda: aparece sólo al pedirla desde la lupa --- */}
      {searchOpen && (
        <div className="relative px-3 pb-2 pt-2.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              setQuery('');
              setSearchOpen(false);
            }}
            placeholder="Buscar proyecto o sesión"
            autoFocus
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            style={{ fontSize: 'var(--skin-text-sm)' }}
          />
        </div>
      )}

      {/* --- Lista --- */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {visibleProjects.length === 0 && (
          <p className="px-3 py-6 text-center text-muted-foreground" style={{ fontSize: 'var(--skin-text-sm)' }}>
            {query ? 'Nada coincide con la búsqueda.' : 'Todavía no hay proyectos.'}
          </p>
        )}

        {visibleProjects.map(({ project, sessions }) => {
          const isCurrent = selectedProject?.projectId === project.projectId;
          const isOpen = openOverride.get(project.projectId) ?? isCurrent;
          const total = project.sessionMeta?.total ?? sessions.length;

          return (
            <div key={project.projectId} className="mb-0.5">
              <div
                className={`group flex cursor-pointer items-center rounded-md transition-colors ${
                  isCurrent ? 'bg-accent' : 'hover:bg-accent/60'
                }`}
                style={rowStyle}
                onClick={() => {
                  onProjectSelect(project);
                  toggleExpanded(project.projectId, isOpen);
                }}
              >
                <button
                  type="button"
                  title={isStarred(project) ? 'Quitar de favoritos' : 'Marcar como favorito'}
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleStar(project);
                  }}
                  className="flex-none"
                >
                  <Star
                    className={`h-3.5 w-3.5 transition-colors ${
                      isStarred(project)
                        ? 'fill-amber-500 text-amber-500'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium tracking-tight">{project.displayName}</div>
                  {isOpen && (
                    <div className="truncate text-muted-foreground" style={{ fontSize: 'var(--skin-text-xs)' }}>
                      {shortPath(project)}
                    </div>
                  )}
                </div>

                {!isOpen && total > 0 && (
                  <span
                    className="flex-none text-muted-foreground transition-opacity group-hover:opacity-0"
                    style={{ fontSize: 'var(--skin-text-xs)' }}
                  >
                    {total}
                  </span>
                )}
                {onProjectDelete && (
                  <button
                    type="button"
                    title="Archivar proyecto"
                    onClick={(event) => {
                      event.stopPropagation();
                      onProjectDelete(project.projectId);
                    }}
                    className="flex-none text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                )}
              </div>

              {isOpen && (
                <div className="ml-[19px] border-l border-border pl-2">
                  <button
                    type="button"
                    onClick={() => onNewSession(project)}
                    className="mb-0.5 flex w-full items-center rounded-md font-medium text-primary transition-colors hover:bg-primary/10"
                    style={rowStyle}
                  >
                    <Plus className="h-3 w-3 flex-none" />
                    Nueva sesión
                  </button>

                  {sessions.map((session) => {
                    const isActive = selectedSession?.id === session.id;
                    const isRenaming = renamingId === session.id;
                    const title = titleOverride.get(session.id) ?? sessionTitle(session);
                    return (
                      <div
                        key={session.id}
                        onClick={() => onSessionSelect(session)}
                        className={`group relative flex cursor-pointer items-center rounded-md transition-colors ${
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent/60'
                        }`}
                        style={rowStyle}
                      >
                        <span
                          className={`h-1.5 w-1.5 flex-none rounded-full ${
                            attention.has(session.id)
                              ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                              : isActive
                                ? 'bg-primary'
                                : 'bg-muted-foreground/60'
                          }`}
                        />
                        {isRenaming ? (
                          <>
                            <input
                              value={renameValue}
                              autoFocus
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void commitRename(session.id);
                                if (event.key === 'Escape') setRenamingId(null);
                              }}
                              onBlur={() => void commitRename(session.id)}
                              className="min-w-0 flex-1 rounded border border-primary bg-background px-1 py-0 text-foreground outline-none"
                              style={{ fontSize: 'var(--skin-text-sm)' }}
                            />
                            <button
                              type="button"
                              title="Guardar"
                              onClick={(event) => {
                                event.stopPropagation();
                                void commitRename(session.id);
                              }}
                              className="flex-none text-muted-foreground hover:text-foreground"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Cancelar"
                              onMouseDown={(event) => {
                                // mousedown y no click: el onBlur del input se
                                // dispara antes y guardaría igual.
                                event.preventDefault();
                                event.stopPropagation();
                                setRenamingId(null);
                              }}
                              className="flex-none text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate">{title}</span>
                            <span
                              className="flex-none text-muted-foreground transition-opacity group-hover:opacity-0"
                              style={{ fontSize: 'var(--skin-text-xs)' }}
                            >
                              {formatAge(session)}
                            </span>
                            <div className="absolute right-2 hidden items-center gap-1.5 group-hover:flex">
                              <button
                                type="button"
                                title="Renombrar sesión"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setRenameValue(title);
                                  setRenamingId(session.id);
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {onSessionDelete && (
                                <button
                                  type="button"
                                  title="Borrar sesión"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSessionDelete(session.id);
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {project.sessionMeta?.hasMore && onLoadMoreSessions && (
                    <button
                      type="button"
                      onClick={() => onLoadMoreSessions(project.projectId)}
                      className="w-full rounded-md text-left text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                      style={rowStyle}
                    >
                      Ver más sesiones
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- Pie: sólo Ajustes. Sin GitHub, sin comunidad, sin reportar issues. --- */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onShowSettings}
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          style={{ fontSize: 'var(--skin-text-sm)' }}
        >
          <Settings className="h-3.5 w-3.5" />
          Ajustes
        </button>
      </div>
      </div>
    </div>
  );
}

export default SkinSidebar;
