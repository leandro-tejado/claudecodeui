import { useEffect } from 'react';

import { usePaletteOpsRegister } from '@/modules/command-palette';
import { writeSelectedProvider } from '@/shared/selectedProvider';
import { useProjectEffectsState } from '@/modules/project-workspace/context/ProjectsStateContext';
import type { LLMProvider, ProjectWorkspaceShellProps } from '@/shared/types';

/** Headless controller rendered by ProjectWorkspaceShell to register palette operations and handle service-worker navigation messages. */
export default function ProjectEffects({
  navigate,
}: Pick<ProjectWorkspaceShellProps, 'navigate'>) {
  const {
    openSettings,
    refreshProjectsSilently,
    setActiveTab,
    setSidebarOpen,
  } = useProjectEffectsState();

  usePaletteOpsRegister({
    openSettings,
    refreshProjects: refreshProjectsSilently,
  });

  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || message.type !== 'notification:navigate') {
        return;
      }

      // Same-origin only. Window messages, unlike service worker ones, can be
      // posted by any frame or extension that has a handle on this window.
      if (event.origin && event.origin !== window.location.origin) {
        return;
      }

      if (typeof message.provider === 'string' && message.provider.trim()) {
        writeSelectedProvider(message.provider as LLMProvider);
      }

      setActiveTab('chat');
      setSidebarOpen(false);
      void refreshProjectsSilently();

      if (typeof message.sessionId === 'string' && message.sessionId) {
        navigate(`/session/${message.sessionId}`);
        return;
      }

      navigate('/');
    };

    // Two sources, one handler. Push notifications arrive from the service
    // worker; the ones the browser shows while the tab is alive are posted by
    // BrowserNotificationsProvider on the window. Routing them through the same
    // function is what keeps a single copy of the navigation rules.
    const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    if (hasServiceWorker) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }
    window.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      if (hasServiceWorker) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
      window.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [navigate, refreshProjectsSilently, setActiveTab, setSidebarOpen]);

  return null;
}
