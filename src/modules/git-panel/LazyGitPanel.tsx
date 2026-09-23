import { retryImport } from '@/shared/lazyWithRetry';
import { lazy, Suspense, type ComponentProps } from 'react';

import type GitPanelImpl from '@/modules/git-panel/GitPanel';

/**
 * The git panel, loaded when its tab is opened.
 *
 * 150 KB of diff rendering and staging UI behind a tab that has to be chosen.
 */
/** Exposed through the module barrel so the app can warm this chunk while idle. */
export const preloadGitPanel = () => import('@/modules/git-panel/GitPanel');

const GitPanel = lazy(() => retryImport(preloadGitPanel));

export function LazyGitPanel(props: ComponentProps<typeof GitPanelImpl>) {
  return (
    <Suspense fallback={null}>
      <GitPanel {...props} />
    </Suspense>
  );
}
