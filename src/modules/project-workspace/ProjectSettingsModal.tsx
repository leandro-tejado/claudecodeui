import { memo, useMemo } from 'react';
import ReactDOM from 'react-dom';

import { useProjectSidebarState } from '@/modules/project-workspace/context/ProjectsStateContext';
import { Settings } from '@/modules/settings';
import { normalizeProjectForSettings } from '@/modules/sidebar';
import type { SettingsProject } from '@/shared/types';

/**
 * Rendered by ProjectWorkspaceShell to host the settings modal.
 *
 * It lives here, next to the other global overlays, rather than inside the
 * sidebar: the settings modal used to be mounted by SidebarModals, which only
 * the old `sidebar/Sidebar.tsx` ever rendered. When SkinSidebar replaced that
 * component the modal lost its only mount point, so `onShowSettings` flipped a
 * flag nothing was reading and the Settings button silently did nothing.
 *
 * Mounting it at shell level also means it no longer depends on which sidebar
 * is in use, and it cannot be mounted twice by the mobile drawer.
 */
function ProjectSettingsModal() {
  const { sidebarSharedProps } = useProjectSidebarState();
  const { projects, showSettings, settingsInitialTab, onCloseSettings } = sidebarSharedProps;

  // Settings expects project identity/path fields to be present for dropdown
  // labels and local-scope MCP config.
  const settingsProjects = useMemo<SettingsProject[]>(
    () => projects.map(normalizeProjectForSettings),
    [projects],
  );

  if (!showSettings) return null;

  return ReactDOM.createPortal(
    <Settings
      isOpen={showSettings}
      onClose={onCloseSettings}
      projects={settingsProjects}
      initialTab={settingsInitialTab}
    />,
    document.body,
  );
}

export default memo(ProjectSettingsModal);
