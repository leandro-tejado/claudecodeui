import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { PanelRightClose } from 'lucide-react';

import { FileTree } from '@/modules/file-tree';
import {
  FILES_PANEL_MAX_WIDTH,
  FILES_PANEL_MIN_WIDTH,
  closeFilesPanel,
  setFilesPanelWidth,
  useSkinUi,
} from '@/modules/skin/skinUiStore';
import { useFilesPanelRoom } from '@/modules/skin/hooks/useFilesPanelRoom';
import { useBusySessionIdSet } from '@/shared/context/SessionProtectionContext';
import type { Project, ProjectSession } from '@/shared/types';

/*
 * Los archivos del proyecto como tercera columna, no como pestaña.
 *
 * Antes el botón Archivos hacía `setActiveTab('files')` y el árbol reemplazaba
 * al chat: eran excluyentes, así que no se podía mirar qué archivos aparecían
 * mientras el agente trabajaba. Acá el árbol vive al costado y el chat nunca se
 * va de la pantalla.
 *
 * Ocupa lugar de verdad (`flex-none` dentro del flex principal) en vez de
 * flotar por encima: un overlay tapa justo lo que se quiere seguir leyendo.
 */

type SkinFilesPanelProps = {
  selectedProject: Project;
  selectedSession: ProjectSession | null;
  /** Con el editor abierto hacen falta cuatro columnas y el umbral de ancho sube. */
  editorOpen: boolean;
  onFileOpen: (filePath: string) => void;
};

/** Rendered by the project-workspace module's WorkspaceMain as the right-hand file column. */
export default function SkinFilesPanel({
  selectedProject,
  selectedSession,
  editorOpen,
  onFileOpen,
}: SkinFilesPanelProps) {
  const { filesPanelOpen, filesPanelWidth } = useSkinUi();
  const hasRoom = useFilesPanelRoom(editorOpen);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  /* El árbol se lee una sola vez por proyecto: no hay watcher en el backend, así
     que sin esto los archivos que el agente crea no aparecen nunca. El disparo
     es el FLANCO de ocupada a libre — suscribirse al estado refrescaría varias
     veces por segundo, que es la frecuencia de los frames de status. */
  const busySessionIds = useBusySessionIdSet();
  const sessionId = selectedSession?.id ?? null;
  const isSessionRunning = Boolean(sessionId && busySessionIds.has(sessionId));
  const wasRunningRef = useRef(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    if (wasRunningRef.current && !isSessionRunning) {
      setRefreshSignal((previous) => previous + 1);
    }
    wasRunningRef.current = isSessionRunning;
  }, [isSessionRunning]);

  /* La manija vive en el borde izquierdo y el panel crece hacia la izquierda,
     así que el delta va restado. Los listeners van en window porque el puntero
     se escapa del borde apenas empieza a moverse. */
  const handleDragStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStateRef.current = { startX: event.clientX, startWidth: filesPanelWidth };

      const onMove = (moveEvent: MouseEvent) => {
        const drag = dragStateRef.current;
        if (!drag) return;
        setFilesPanelWidth(drag.startWidth - (moveEvent.clientX - drag.startX));
      };

      const onUp = () => {
        dragStateRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [filesPanelWidth],
  );

  // Cerrado por el usuario, u oculto porque la ventana no da: en el segundo
  // caso la preferencia queda intacta y el panel vuelve solo al agrandar.
  if (!filesPanelOpen || !hasRoom) {
    return null;
  }

  return (
    <div
      className="relative flex h-full flex-none flex-col overflow-hidden border-l border-border/60 bg-background"
      style={{ width: filesPanelWidth }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar el ancho del panel de archivos"
        aria-valuemin={FILES_PANEL_MIN_WIDTH}
        aria-valuemax={FILES_PANEL_MAX_WIDTH}
        aria-valuenow={filesPanelWidth}
        onMouseDown={handleDragStart}
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/40"
      />

      <div className="flex flex-none items-center gap-2 border-b border-border/60 px-3 py-1.5 pl-4">
        <span
          className="min-w-0 flex-1 truncate font-medium text-foreground"
          title={selectedProject.path || selectedProject.displayName}
          style={{ fontSize: 'var(--skin-text-xs)' }}
        >
          {selectedProject.displayName}
        </span>
        <button
          type="button"
          onClick={closeFilesPanel}
          title="Cerrar el panel de archivos"
          aria-label="Cerrar el panel de archivos"
          className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <FileTree
          selectedProject={selectedProject}
          onFileOpen={onFileOpen}
          refreshSignal={refreshSignal}
          narrow
        />
      </div>
    </div>
  );
}
