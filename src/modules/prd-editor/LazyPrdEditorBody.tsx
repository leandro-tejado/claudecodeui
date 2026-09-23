import { retryImport } from '@/shared/lazyWithRetry';
import { lazy, type ComponentProps } from 'react';

import type PrdEditorBodyImpl from '@/modules/prd-editor/PrdEditorBody';
import { LazyPanel } from '@/shared/ui/LazyPanel';

/**
 * The PRD editing surface, loaded when a PRD is opened.
 *
 * It is the second door into CodeMirror: deferring the file editor alone would
 * have left this one pulling the same 644 KB back into the initial bundle.
 */
const PrdEditorBody = lazy(() => retryImport(() => import('@/modules/prd-editor/PrdEditorBody')));

export function LazyPrdEditorBody(props: ComponentProps<typeof PrdEditorBodyImpl>) {
  return (
    <LazyPanel variant="editor">
      <PrdEditorBody {...props} />
    </LazyPanel>
  );
}
