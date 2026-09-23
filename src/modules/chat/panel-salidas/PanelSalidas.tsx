import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, FileTextIcon, ImageIcon, RefreshCwIcon, TableIcon } from 'lucide-react';

import { Button, ScrollArea } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { SalidaInfo, SalidaTipo } from '@/shared/types';
import { usePanelSalidasOpen, togglePanelSalidas } from '@/modules/chat/panel-salidas/panelSalidasStore';
import { useSalidasList } from '@/modules/chat/panel-salidas/useSalidasList';
import SalidaPreview from '@/modules/chat/panel-salidas/SalidaPreview';

type PanelSalidasProps = {
  projectId: string | null;
  /** Bumped by the chat interface on every turn's terminal `complete` event. */
  refreshSignal: number;
};

const ICON_BY_TIPO: Record<SalidaTipo, React.ComponentType<{ className?: string }>> = {
  html: FileTextIcon,
  pdf: FileTextIcon,
  imagen: ImageIcon,
  tabla: TableIcon,
  texto: FileTextIcon,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Collapsible side panel listing what the agent left in `<proyecto>/.informes/`
 * for the current session, with a preview of the selected output. Works the
 * same in both CloudCLI chat modes (in-process SDK and tmux) because it only
 * ever reads the filesystem through the Salidas API — it has no idea which
 * provider produced a file.
 *
 * Rendered by ChatInterface, not WorkspaceMain: per the plan, "el panel va en
 * el chat" so it is available regardless of which provider/session is active,
 * without extra wiring in the tab-switching layout.
 */
export default function PanelSalidas({ projectId, refreshSignal }: PanelSalidasProps) {
  const { t } = useTranslation('chat');
  const open = usePanelSalidasOpen();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { salidas, loading, error, refresh } = useSalidasList({
    projectId,
    refreshSignal,
    enabled: open,
  });

  // The previously selected output can vanish (project switch, or the agent
  // never wrote it) — fall back to the first available one instead of
  // pointing the preview at nothing.
  useEffect(() => {
    if (salidas.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !salidas.some((salida) => salida.id === selectedId)) {
      setSelectedId(salidas[0].id);
    }
  }, [salidas, selectedId]);

  if (!open) {
    return (
      <div className="flex flex-shrink-0 items-start border-l border-border bg-card">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanelSalidas}
          title={t('salidasPanel.open', { defaultValue: 'Abrir panel de Salidas' })}
          aria-label={t('salidasPanel.open', { defaultValue: 'Abrir panel de Salidas' })}
          className="m-1"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" aria-hidden />
        </Button>
      </div>
    );
  }

  const selected = salidas.find((salida) => salida.id === selectedId) ?? null;

  return (
    <div className="flex h-full w-[320px] flex-shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">{t('salidasPanel.title', { defaultValue: 'Salidas' })}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading || !projectId}
            title={t('salidasPanel.refresh', { defaultValue: 'Actualizar' })}
            aria-label={t('salidasPanel.refresh', { defaultValue: 'Actualizar' })}
          >
            <RefreshCwIcon className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePanelSalidas}
            title={t('salidasPanel.close', { defaultValue: 'Cerrar panel de Salidas' })}
            aria-label={t('salidasPanel.close', { defaultValue: 'Cerrar panel de Salidas' })}
          >
            <ChevronRightIcon className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 flex-col overflow-hidden md:flex md:flex-row">
        <ScrollArea className="h-40 flex-shrink-0 border-b border-border md:h-full md:w-36 md:border-b-0 md:border-r">
          {error && (
            <p className="p-3 text-xs text-destructive">{error}</p>
          )}
          {!error && salidas.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              {loading
                ? t('salidasPanel.loading', { defaultValue: 'Cargando…' })
                : t('salidasPanel.empty', { defaultValue: 'Sin salidas todavia.' })}
            </p>
          )}
          <ul>
            {salidas.map((salida) => {
              const Icon = ICON_BY_TIPO[salida.tipo];
              const isSelected = salida.id === selectedId;
              return (
                <li key={salida.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(salida.id)}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent',
                      isSelected && 'bg-accent',
                    )}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{salida.id}</span>
                      <span className="block text-muted-foreground">{formatBytes(salida.bytes)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <div className="min-h-0 flex-1 overflow-auto">
          {selected
            ? <SalidaPreview key={selected.id} projectId={projectId ?? ''} salida={selected} />
            : (
              <p className="p-3 text-sm text-muted-foreground">
                {t('salidasPanel.selectPrompt', { defaultValue: 'Elegi una salida de la lista.' })}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
