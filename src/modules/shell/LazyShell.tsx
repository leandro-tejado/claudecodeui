import { lazy, type ComponentProps } from 'react';

import type ShellImpl from '@/modules/shell/Shell';
import { LazyPanel } from '@/shared/ui/LazyPanel';

/**
 * The terminal, loaded when someone actually opens one.
 *
 * xterm and its addons are 387 KB that every visitor used to download before the
 * first render, terminal or not. This is what the module's barrel exports as
 * `Shell`, so the deferral cannot be undone by an import that reaches past it:
 * there is no static path to the real component outside this file.
 */
/** Exposed through the module barrel so the app can warm this chunk while idle. */
export const preloadShell = () => import('@/modules/shell/Shell');

const Shell = lazy(preloadShell);

export function LazyShell(props: ComponentProps<typeof ShellImpl>) {
  return (
    <LazyPanel variant="terminal">
      <Shell {...props} />
    </LazyPanel>
  );
}
