import { retryImport } from '@/shared/lazyWithRetry';
import { Suspense, lazy, type ComponentProps } from 'react';

import type { ShiningText as ShiningTextImpl } from '@/modules/chat/composer/ShiningText';
import { cn } from '@/shared/utils';

/**
 * The shimmering activity label, with its animation loaded on demand.
 *
 * It is the composer's only reason to pull in motion, and the label is legible
 * without the shimmer — so the plain text renders immediately and starts moving
 * once the animation library arrives.
 */
const ShiningText = lazy(() =>
  retryImport(() => import('@/modules/chat/composer/ShiningText')).then(module => ({
    default: module.ShiningText,
  })),
);

export function LazyShiningText(props: ComponentProps<typeof ShiningTextImpl>) {
  return (
    <Suspense fallback={<span className={cn('text-muted-foreground', props.className)}>{props.text}</span>}>
      <ShiningText {...props} />
    </Suspense>
  );
}
