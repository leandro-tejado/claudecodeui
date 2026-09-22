import { lazy, type ComponentProps } from 'react';

import type CodeEditorImpl from '@/modules/code-editor/CodeEditor';
import { LazyPanel } from '@/shared/ui/LazyPanel';

/**
 * The file editor, loaded when a file is opened.
 *
 * CodeMirror and its language modes are 644 KB, the second heaviest thing the app
 * ships, and most sessions never open a file. The editor's own chrome loads with
 * it, so the skeleton stands in for the whole panel rather than flashing an empty
 * frame with a working toolbar.
 */
/** Exposed through the module barrel so the app can warm this chunk while idle. */
export const preloadCodeEditor = () => import('@/modules/code-editor/CodeEditor');

const CodeEditor = lazy(preloadCodeEditor);

export function LazyCodeEditor(props: ComponentProps<typeof CodeEditorImpl>) {
  return (
    <LazyPanel variant="editor">
      <CodeEditor {...props} />
    </LazyPanel>
  );
}
