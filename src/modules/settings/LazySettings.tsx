import { retryImport } from '@/shared/lazyWithRetry';
import { lazy, Suspense, type ComponentProps } from 'react';

import type SettingsImpl from '@/modules/settings/Settings';

/**
 * The settings dialog, loaded when it is opened.
 *
 * Settings and the MCP server manager it embeds are around 200 KB that only
 * matter once someone opens the dialog, which most sessions never do. The
 * fallback is null on purpose: both call sites already render nothing until
 * the dialog is open, so a skeleton would flash a second empty modal over the
 * app instead of the dialog appearing a moment later.
 */
/** Exposed through the module barrel so the app can warm this chunk while idle. */
export const preloadSettings = () => import('@/modules/settings/Settings');

const Settings = lazy(() => retryImport(preloadSettings));

export function LazySettings(props: ComponentProps<typeof SettingsImpl>) {
  return (
    <Suspense fallback={null}>
      <Settings {...props} />
    </Suspense>
  );
}
