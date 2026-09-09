import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';

import { Button } from '@/shared/ui';
import type { LLMProvider, Project, ProjectSession, SessionWithProvider } from '@/shared/types';
import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';
import { ReorderList } from '@/modules/sidebar/ReorderList';
import { useCompactSidebar } from '@/modules/sidebar/hooks/useCompactSidebar';

/** Orden manual por proyecto — cada proyecto arrastra sus propias sesiones. */
function claveOrden(projectId: string): string {
  return `cloudcli-orden-sesiones-${projectId}`;
}

function aplicarOrdenManual<T extends { id: string }>(sessions: T[], orden: string[]): T[] {
  const posicion = new Map(orden.map((id, i) => [id, i]));
  return [...sessions].sort((a, b) => {
    const pa = posicion.get(a.id);
    const pb = posicion.get(b.id);
    if (pa === undefined && pb === undefined) return 0;
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    return pa - pb;
  });
}

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  sessions: SessionWithProvider[];
  selectedSession: ProjectSession | null;
  initialSessionsLoaded: boolean;
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;
  activeSessions: ReadonlySet<string>;
  attentionSessionIds: ReadonlySet<string>;
  currentTime: Date;
  /** The session being renamed, when it belongs to this project. */
  sessionRenameId: string | null;
  sessionRenameDraft: string;
  onRenameDraftChange: (draft: string) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onForkSession?: (session: SessionWithProvider) => void;
  onLoadMoreSessions: (projectId: string) => void;
  onNewSession: (project: Project) => void;
  t: TFunction;
};

function SessionListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-md p-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-3 w-3 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${60 + index * 15}%` }} />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** Rendered by SidebarProjectItem to show an expanded project's sessions, delegating each row to SidebarSessionItem. */
export default function SidebarProjectSessions({
  project,
  isExpanded,
  sessions,
  selectedSession,
  initialSessionsLoaded,
  hasMoreSessions,
  isLoadingMoreSessions,
  activeSessions,
  attentionSessionIds,
  currentTime,
  sessionRenameId,
  sessionRenameDraft,
  onRenameDraftChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onForkSession,
  onLoadMoreSessions,
  onNewSession,
  t,
}: SidebarProjectSessionsProps) {
  const isCompact = useCompactSidebar();
  const [orden, setOrden] = useState<string[]>([]);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(claveOrden(project.projectId));
      if (guardado) setOrden(JSON.parse(guardado));
    } catch {
      // sin storage, o JSON corrupto: arranca sin orden manual
    }
  }, [project.projectId]);

  const sessionsOrdenadas = useMemo(() => aplicarOrdenManual(sessions, orden), [sessions, orden]);

  const guardarOrden = (siguiente: SessionWithProvider[]) => {
    const ids = siguiente.map((s) => s.id);
    setOrden(ids);
    try {
      localStorage.setItem(claveOrden(project.projectId), JSON.stringify(ids));
    } catch {
      // sin storage: el orden vive solo en memoria de esta carga
    }
  };

  if (!isExpanded) {
    return null;
  }

  const hasSessions = sessions.length > 0;

  return (
    <div className="ml-3 space-y-1 border-l border-border pl-3">
      {isCompact ? (
        <div className="px-3 pb-1 pt-1">
          <button
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
            onClick={() => {
              onProjectSelect(project);
              onNewSession(project);
            }}
          >
            <Plus className="h-3 w-3" />
            {t('sessions.newSession')}
          </button>
        </div>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="flex h-8 w-full justify-start gap-2 bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => onNewSession(project)}
        >
          <Plus className="h-3 w-3" />
          {t('sessions.newSession')}
        </Button>
      )}

      {!initialSessionsLoaded ? (
        <SessionListSkeleton />
      ) : !hasSessions ? (
        <div className="px-3 py-2 text-left">
          <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      ) : (
        <>
          <ReorderList
            items={sessionsOrdenadas}
            getId={(s) => s.id}
            getLabel={(s) => s.summary || s.id}
            onReorder={guardarOrden}
            label={t('sessions.newSession', 'Sessions')}
          >
            {(session) => (
              <SidebarSessionItem
                project={project}
                session={session}
                selectedSession={selectedSession}
                isProcessing={activeSessions.has(session.id)}
                needsAttention={attentionSessionIds.has(session.id)}
                currentTime={currentTime}
                onRenameDraftChange={onRenameDraftChange}
                isEditing={session.id === sessionRenameId}
                renameDraft={session.id === sessionRenameId ? sessionRenameDraft : ''}
                onStartEditingSession={onStartEditingSession}
                onCancelEditingSession={onCancelEditingSession}
                onSaveEditingSession={onSaveEditingSession}
                onProjectSelect={onProjectSelect}
                onSessionSelect={onSessionSelect}
                onDeleteSession={onDeleteSession}
                onForkSession={onForkSession}
                t={t}
              />
            )}
          </ReorderList>

          {hasMoreSessions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onLoadMoreSessions(project.projectId)}
              disabled={isLoadingMoreSessions}
            >
              {isLoadingMoreSessions ? t('sessions.loadingSessions') : 'Load more sessions'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
