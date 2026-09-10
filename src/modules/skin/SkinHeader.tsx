import { Folder, GitBranch, Menu, MessageSquare, ClipboardCheck, MonitorPlay, Moon, PanelLeft, Sun, type LucideIcon } from 'lucide-react';
import { useCallback, useRef, type Dispatch, type MouseEvent, type SetStateAction, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { usePlugins, PluginIcon } from '@/modules/plugins';
import { toggleSidebarCollapsed } from '@/modules/skin/skinUiStore';
import { useTheme } from '@/shared/context/ThemeContext';
import { Tooltip } from '@/shared/ui';
import type { AppTab, Project, ProjectSession } from '@/shared/types';
import { getSessionTitle } from '@/shared/utils';

/*
 * Cabecera del rediseño propio.
 *
 * Sustituye a WorkspaceHeader desde un injerto de una línea en WorkspaceMain.
 *
 * Qué cambia:
 * - Sin el logo del proveedor al lado del título: el nombre de la sesión solo.
 * - Las pestañas son sólo íconos, con tooltip. Ocupaban una franja entera para
 *   repetir en texto lo que el ícono ya decía.
 * - Sin la pestaña Shell: no se usa. El terminal sigue existiendo en el VPS
 *   (ttyd, por su propio puerto) — acá sólo se saca de la vista.
 * - Botón para colapsar el sidebar.
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
};

type BuiltInTab = { id: AppTab; labelKey: string; icon: LucideIcon };

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

/* `shell` no está en la lista a propósito: es la forma de ocultar la pestaña
   sin tocar el enum de upstream ni el componente que la renderiza. */
const BASE_TABS: BuiltInTab[] = [
  { id: 'chat', labelKey: 'tabs.chat', icon: MessageSquare },
  { id: 'files', labelKey: 'tabs.files', icon: Folder },
  { id: 'git', labelKey: 'tabs.git', icon: GitBranch },
];

export default function SkinHeader({
  activeTab,
  setActiveTab,
  selectedProject,
  selectedSession,
  shouldShowTasksTab,
  shouldShowBrowserTab,
  isMobile,
  onMenuClick,
}: SkinHeaderProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();
  const { isDarkMode, toggleDarkMode } = useTheme();

  const tabs: BuiltInTab[] = [
    ...BASE_TABS,
    ...(shouldShowBrowserTab ? [{ id: 'browser' as AppTab, labelKey: 'tabs.browser', icon: MonitorPlay }] : []),
    ...(shouldShowTasksTab ? [{ id: 'tasks' as AppTab, labelKey: 'tabs.tasks', icon: ClipboardCheck }] : []),
  ];

  const enabledPlugins = plugins.filter((plugin) => plugin.enabled);

  const title =
    activeTab === 'chat'
      ? selectedSession
        ? getSessionTitle(selectedSession)
        : t('mainContent.newSession')
      : activeTab === 'files'
        ? t('mainContent.projectFiles')
        : activeTab === 'git'
          ? t('tabs.git')
          : activeTab === 'tasks'
            ? 'TaskMaster'
            : activeTab === 'browser'
              ? t('tabs.browser')
              : t('misc.projectFallback');

  return (
    <header className="flex-shrink-0 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2">
        {isMobile && <SkinMenuButton onMenuClick={onMenuClick} />}

        {!isMobile && (
          <Tooltip content="Mostrar u ocultar el panel" position="bottom">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label="Mostrar u ocultar el panel"
              className="grid h-7 w-7 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </Tooltip>
        )}

        {/* Título: sin logo de proveedor, el nombre de la sesión y nada más. */}
        <div className="min-w-0 flex-1">
          <h2
            title={title}
            className="truncate font-semibold leading-tight text-foreground"
            style={{ fontSize: 'var(--skin-text)' }}
          >
            {title}
          </h2>
          <div
            className="truncate leading-tight text-muted-foreground"
            style={{ fontSize: 'var(--skin-text-xs)' }}
          >
            {selectedProject.displayName}
          </div>
        </div>

        {/* Tema: un clic, sin entrar a Ajustes. El control de tres estados
            (con "Sistema") sigue estando en Ajustes → Apariencia; acá alcanza
            con alternar, que es lo que se hace todos los días. */}
        <Tooltip content={isDarkMode ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} position="bottom">
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={isDarkMode ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="grid h-7 w-7 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </Tooltip>

        {/* Pestañas: sólo íconos. El tooltip carga el nombre. */}
        <nav className="flex flex-none items-center gap-0.5 rounded-lg bg-muted p-0.5" role="tablist">
          {tabs.map(({ id, labelKey, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <Tooltip key={id} content={t(labelKey)} position="bottom">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={t(labelKey)}
                  onClick={() => setActiveTab(id)}
                  className={`grid h-7 w-8 place-items-center rounded-md transition-colors ${
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </Tooltip>
            );
          })}

          {enabledPlugins.map((plugin) => {
            const id = `plugin:${plugin.name}` as AppTab;
            const isActive = activeTab === id;
            return (
              <Tooltip key={id} content={plugin.displayName || plugin.name} position="bottom">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={plugin.displayName || plugin.name}
                  onClick={() => setActiveTab(id)}
                  className={`grid h-7 w-8 place-items-center rounded-md transition-colors ${
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <PluginIcon pluginName={plugin.name} iconFile={plugin.icon} className="h-4 w-4" />
                </button>
              </Tooltip>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
