import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, FileTextIcon, ImageIcon, RefreshCwIcon, TableIcon } from 'lucide-react';

import { Button, ScrollArea } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { SalidaInfo, SalidaTipo } from '@/shared/types';
import {
  SALIDAS_LISTA_MAX_WIDTH,
  SALIDAS_LISTA_MIN_WIDTH,
  SALIDAS_PANEL_MAX_WIDTH,
  SALIDAS_PANEL_MIN_WIDTH,
  setSalidasListaWidth,
  setSalidasPanelWidth,
  togglePanelSalidas,
  usePanelSalidasAnchos,
  usePanelSalidasOpen,
} from '@/modules/chat/panel-salidas/panelSalidasStore';
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

/**
 * Arrastre de una manija vertical con Pointer Events, para que funcione igual
 * con mouse y con el dedo. `signo` es -1 cuando la manija está en el borde
 * izquierdo de lo que crece (el panel crece hacia la izquierda) y 1 cuando
 * está en el borde derecho (la lista crece hacia la derecha).
 */
function useArrastreAncho(ancho: number, signo: 1 | -1, aplicar: (width: number) => void) {
  return useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const manija = event.currentTarget;
    manija.setPointerCapture(event.pointerId);
    const inicioX = event.clientX;
    const inicioAncho = ancho;

    const onMove = (moveEvent: PointerEvent) => {
      aplicar(inicioAncho + signo * (moveEvent.clientX - inicioX));
    };
    const onUp = () => {
      manija.removeEventListener('pointermove', onMove);
      manija.removeEventListener('pointerup', onUp);
      manija.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    manija.addEventListener('pointermove', onMove);
    manija.addEventListener('pointerup', onUp);
    manija.addEventListener('pointercancel', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [ancho, signo, aplicar]);
}

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
  const anchos = usePanelSalidasAnchos();
  const arrastrarPanel = useArrastreAncho(anchos.panel, -1, setSalidasPanelWidth);
  const arrastrarLista = useArrastreAncho(anchos.lista, 1, setSalidasListaWidth);
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
    <div
      className="relative flex h-full flex-shrink-0 flex-col border-l border-border bg-card"
      style={{ width: anchos.panel, maxWidth: '85vw' }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('salidasPanel.resizePanel', { defaultValue: 'Ajustar el ancho del panel de Salidas' })}
        aria-valuemin={SALIDAS_PANEL_MIN_WIDTH}
        aria-valuemax={SALIDAS_PANEL_MAX_WIDTH}
        aria-valuenow={anchos.panel}
        onPointerDown={arrastrarPanel}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none transition-colors hover:bg-primary/40"
      />
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
        <ScrollArea
          className="h-40 flex-shrink-0 border-b border-border md:h-full md:w-[var(--salidas-lista)] md:border-b-0"
          style={{ '--salidas-lista': `${anchos.lista}px` } as React.CSSProperties}
        >
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

        {/* Entre la lista y la vista previa; solo en md+, donde van lado a lado. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('salidasPanel.resizeList', { defaultValue: 'Ajustar el ancho de la lista de salidas' })}
          aria-valuemin={SALIDAS_LISTA_MIN_WIDTH}
          aria-valuemax={SALIDAS_LISTA_MAX_WIDTH}
          aria-valuenow={anchos.lista}
          onPointerDown={arrastrarLista}
          className="hidden w-1 flex-shrink-0 cursor-col-resize touch-none bg-border transition-colors hover:bg-primary/40 md:block"
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
