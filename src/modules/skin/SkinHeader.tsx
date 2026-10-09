import { ArrowLeft, Menu, PanelRight } from 'lucide-react';
import { useCallback, useEffect, useRef, type Dispatch, type MouseEvent, type SetStateAction, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountChip, TopeAviso, cuentaDeSesion, reiniciarCuentaNueva, useCuentas } from '@/modules/cuentas';
import { usePlugins } from '@/modules/plugins';
import SkinMedidorExtra from '@/modules/skin/SkinMedidorExtra';
import SkinRecursos from '@/modules/skin/SkinRecursos';
import { toggleFilesPanel, useSkinUi } from '@/modules/skin/skinUiStore';
import { UsageWindowIndicator } from '@/modules/usage-window';
import { Tooltip } from '@/shared/ui';
import type { AppTab, Project, ProjectSession } from '@/shared/types';
import { getSessionTitle } from '@/shared/utils';

/*
 * Cabecera del rediseño propio.
 *
 * Sustituye a WorkspaceHeader desde un injerto de una línea en WorkspaceMain.
 *
 * Qué cambia (boceto `design-system/visual-refs/09-octubre-vista-principal.html`,
 * aprobado el 9-oct):
 * - Una sola fila: título con el proyecto al lado, chip de cuenta, el anillo de
 *   cuota y el ícono de Archivos. Nada más a la vista.
 * - Sin pestañas. Terminal, Git y Navegador se sacaron (no se usan; el código
 *   sigue en su módulo). Tareas, Plugins y Tema se abren desde Ajustes.
 * - Los medidores de contexto, compactación, RAM y disco viven dentro del
 *   anillo: un clic abre el medidor completo.
 */

type SkinHeaderProps = {
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  selectedProject: Project;
  selectedSession: ProjectSession | null;
  shouldShowTasksTab: boolean;
  shouldShowBrowserTab: boolean;
  isMobile: boolean;
  onMenuClick: () => void;
  /**
   * Abre una sesión nueva con la cuenta indicada. Lo usa el aviso de tope: es la
   * única vía para pasar a otra cuenta, y es una sesión nueva a propósito.
   */
  onNewSessionWithCuenta?: (cuentaId: string) => void;
};

/*
 * Botón de menú en mobile. Es propio y no el de upstream porque las reglas de
 * arquitectura del repo obligan a importar entre módulos por el barrel, y el de
 * project-workspace sólo exporta su ruta. Antes que abrirle un export a upstream
 * —y gastar presupuesto de merge— se replica acá, incluida la parte que importa:
 * un `touchend` dispara además un click fantasma unos milisegundos después, así
 * que el segundo se descarta o el cajón se abre y se cierra en el mismo toque.
 */
function SkinMenuButton({ onMenuClick }: { onMenuClick: () => void }) {
  const { t } = useTranslation();
  const suppressNextClick = useRef(false);

  const open = useCallback(
    (event: MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onMenuClick();
    },
    [onMenuClick],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLButtonElement>) => {
      suppressNextClick.current = true;
      open(event);
      window.setTimeout(() => {
        suppressNextClick.current = false;
      }, 350);
    },
    [open],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (suppressNextClick.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      open(event);
    },
    [open],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      aria-label={t('misc.openMenu')}
      className="pwa-menu-button grid h-7 w-7 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

/* Los nombres de las vistas que no son el chat. Ya no tienen pestaña en la
   cabecera (boceto 09-oct): Tareas y Plugins se abren desde Ajustes, y Git,
   Navegador y Terminal se sacaron de la vista. Si una sesión vuelve con una de
   esas vistas guardada, el título la nombra y la flecha regresa al chat. */
function tituloDeVista(activeTab: AppTab, t: (key: string) => string, pluginName?: string): string {
  if (activeTab.startsWith('plugin:')) return pluginName ?? activeTab.replace('plugin:', '');
  if (activeTab === 'git') return t('tabs.git');
  if (activeTab === 'tasks') return 'TaskMaster';
  if (activeTab === 'browser') return t('tabs.browser');
  if (activeTab === 'files') return t('tabs.files');
  return t('misc.projectFallback');
}

export default function SkinHeader({
  activeTab,
  setActiveTab,
  selectedProject,
  selectedSession,
  isMobile,
  onMenuClick,
  onNewSessionWithCuenta,
}: SkinHeaderProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();
  const { filesPanelOpen } = useSkinUi();

  /* La cuenta de lo que se está mirando: la de la sesión abierta o, si todavía
     no hay sesión, la que se eligió para la nueva. El anillo de cuota y el chip
     leen de acá, así que los dos hablan siempre de la misma cuenta. */
  const { nuevaCuenta, cuentas } = useCuentas();
  const cuentaActiva = selectedSession ? cuentaDeSesion(selectedSession) : nuevaCuenta;
  const idsCuentas = cuentas.map((cuenta) => cuenta.id);

  /* La elección de cuenta de una sesión nueva vale hasta que esa sesión existe:
     al quedar seleccionada una sesión, la siguiente nueva vuelve a Optimum. */
  const selectedSessionId = selectedSession?.id ?? null;
  useEffect(() => {
    if (selectedSessionId) reiniciarCuentaNueva();
  }, [selectedSessionId]);

  /* Ctrl/⌘+B abre y cierra Archivos (escena 4 del boceto). En el teléfono no
     hay panel al costado: ahí Archivos sigue siendo una vista entera. */
  useEffect(() => {
    if (isMobile) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleFilesPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile]);

  const enChat = activeTab === 'chat';
  const pluginName = activeTab.startsWith('plugin:')
    ? plugins.find((plugin) => `plugin:${plugin.name}` === activeTab)?.displayName
    : undefined;
  const title = enChat
    ? selectedSession
      ? getSessionTitle(selectedSession)
      : t('mainContent.newSession')
    : tituloDeVista(activeTab, t, pluginName);

  return (
    // `ds-material-chrome`: material translúcido (design-system/tokens.md,
    // "Materiales"), que cae a `--ds-surface-2` opaco con `prefers-reduced-transparency`.
    // Una sola fila de 48 px, como el boceto 09-octubre-vista-principal.html.
    <header className="ds-material-chrome flex-shrink-0 border-b border-border/60">
      <div className="flex h-12 min-w-0 items-center gap-2 px-3 sm:gap-2.5 sm:px-3.5">
        {isMobile && <SkinMenuButton onMenuClick={onMenuClick} />}

        {!enChat && (
          <Tooltip content="Volver al chat" position="bottom">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              aria-label="Volver al chat"
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Tooltip>
        )}

        {/* Título y proyecto en la misma línea: el proyecto, chico y gris. */}
        <h2
          title={`${title} · ${selectedProject.displayName}`}
          className="min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] text-foreground"
          style={{ fontSize: 'var(--skin-text-sm)' }}
        >
          {title}
          {!isMobile && (
            <small className="ml-2 font-normal text-ds-faint" style={{ fontSize: 'var(--skin-text-xs)' }}>
              {selectedProject.displayName}
            </small>
          )}
        </h2>

        {enChat && <AccountChip cuenta={cuentaActiva} size="md" />}

        {/* RAM y disco solo aparecen acá si pasan el 85 %; si no, viven en el medidor. */}
        <SkinRecursos soloSiAlto />

        <UsageWindowIndicator cuenta={cuentaActiva} cuentas={idsCuentas} extra={<SkinMedidorExtra />} />

        {!isMobile && (
          <Tooltip content="Archivos (Ctrl+B)" position="bottom">
            <button
              type="button"
              onClick={toggleFilesPanel}
              aria-pressed={filesPanelOpen}
              aria-label="Archivos del proyecto"
              aria-keyshortcuts="Control+B"
              className={`grid h-8 w-8 flex-none place-items-center rounded-md transition-colors ${
                filesPanelOpen
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </Tooltip>
        )}
      </div>

      {enChat && (
        <TopeAviso cuenta={cuentaActiva} onAbrirConCuenta={onNewSessionWithCuenta} />
      )}
    </header>
  );
}
