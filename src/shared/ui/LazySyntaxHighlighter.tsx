import * as React from 'react';

import type { SyntaxHighlighter as SyntaxHighlighterImpl } from '@/shared/syntaxHighlighter';
import { retryImport } from '@/shared/lazyWithRetry';

type HighlighterProps = React.ComponentProps<typeof SyntaxHighlighterImpl>;

/**
 * The code-block highlighter, loaded the first time a code block is rendered.
 *
 * refractor and its 51 registered grammars are 359 KB, and a session can go a
 * long way without a single fenced block. While the module is in flight the same
 * text is rendered unhighlighted in the same monospace box, so the block is
 * readable immediately and only gains colour — no reflow, no spinner, and copy
 * works throughout.
 */
const Highlighter = React.lazy(async () => {
  const { SyntaxHighlighter } = await retryImport(() => import('@/shared/syntaxHighlighter'));
  return { default: SyntaxHighlighter as React.ComponentType<HighlighterProps> };
});

export function LazySyntaxHighlighter(props: HighlighterProps) {
  return (
    <React.Suspense fallback={<PlainCode {...props} />}>
      <Highlighter {...props} />
    </React.Suspense>
  );
}

/**
 * Stands in for the highlighted block: same box, same metrics, no colour. The
 * styles are copied from what the highlighter itself applies so the swap is
 * invisible apart from the syntax colours arriving.
 */
function PlainCode({ children, customStyle, codeTagProps }: HighlighterProps) {
  return (
    <pre style={{ ...customStyle, overflowX: 'auto' }}>
      <code style={codeTagProps?.style}>{children}</code>
    </pre>
  );
}
