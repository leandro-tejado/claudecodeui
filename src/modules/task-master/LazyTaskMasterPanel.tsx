import { retryImport } from '@/shared/lazyWithRetry';
import { lazy, Suspense, type ComponentProps } from 'react';

import type TaskMasterPanelImpl from '@/modules/task-master/TaskMasterPanel';

/**
 * The Task Master panel, loaded when its tab is opened.
 *
 * Only the panel is deferred. The module's providers and hooks stay static:
 * App and the sidebar read task state on the first render, so deferring them
 * would defer the app itself.
 */
const TaskMasterPanel = lazy(() => retryImport(() => import('@/modules/task-master/TaskMasterPanel')));

export function LazyTaskMasterPanel(props: ComponentProps<typeof TaskMasterPanelImpl>) {
  return (
    <Suspense fallback={null}>
      <TaskMasterPanel {...props} />
    </Suspense>
  );
}
