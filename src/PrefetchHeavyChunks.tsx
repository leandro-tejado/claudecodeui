import { useEffect } from 'react';

import { preloadCodeEditor } from '@/modules/code-editor';
import { preloadGitPanel } from '@/modules/git-panel';
import { preloadSettings } from '@/modules/settings';
import { preloadShell } from '@/modules/shell';
import { preloadReorderList } from '@/modules/sidebar';
import { runWhenIdle } from '@/shared/idleQueue';

/**
 * Warms the chunks the app loads on demand, once the user is inside.
 *
 * Deferring the terminal, the editor and the rest is what made the first load
 * small; this is the other half of that trade, so the first click does not pay
 * for it. It renders nothing and mounts only as a child of ProtectedRoute: on
 * the login screen the download budget matters most, and nothing is fetched
 * there.
 *
 * The list lives here, in the composition layer, and not in `shared/`: a shared
 * file that knows every module is the one import the dependency rules exist to
 * prevent. `shared/idleQueue` decides *when*; this file decides *what*.
 *
 * Order is by how soon each one is likely to be needed — the session list is on
 * screen already, the terminal is one click away, settings and git are further.
 */
export default function PrefetchHeavyChunks() {
  useEffect(() => {
    runWhenIdle([
      preloadReorderList,
      () => import('@/shared/syntaxHighlighter'),
      preloadShell,
      preloadCodeEditor,
      preloadSettings,
      preloadGitPanel,
    ]);
  }, []);

  return null;
}
