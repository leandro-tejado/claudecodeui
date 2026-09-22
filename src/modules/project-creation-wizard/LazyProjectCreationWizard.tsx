import { lazy, Suspense, type ComponentProps } from 'react';

import type ProjectCreationWizardImpl from '@/modules/project-creation-wizard/ProjectCreationWizard';

/**
 * The new-project wizard, loaded when it is opened.
 *
 * A modal reached from a button, not something the app needs to start.
 */
const ProjectCreationWizard = lazy(() => import('@/modules/project-creation-wizard/ProjectCreationWizard'));

export function LazyProjectCreationWizard(props: ComponentProps<typeof ProjectCreationWizardImpl>) {
  return (
    <Suspense fallback={null}>
      <ProjectCreationWizard {...props} />
    </Suspense>
  );
}
