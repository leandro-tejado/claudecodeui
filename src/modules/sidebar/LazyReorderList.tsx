import { retryImport } from '@/shared/lazyWithRetry';
import { Suspense, lazy, type ComponentType } from 'react';

import type { ReorderListProps } from '@/modules/sidebar/ReorderList';
import { cn } from '@/shared/utils';

/**
 * The reorderable session list, with its drag engine loaded in the background.
 *
 * This list is on screen from the first frame, so it cannot simply wait: motion
 * is 390 KB and it was the last big thing holding the initial download up. The
 * fallback renders the same rows, in the same order, with the same markup — only
 * the grip is inert. Someone reading their sessions sees no difference; someone
 * who reaches for the grip in the first moment finds it a beat later.
 */
/** Exposed through the module barrel so the app can warm this chunk while idle. */
export const preloadReorderList = () => import('@/modules/sidebar/ReorderList');

const ReorderList = lazy(() =>
  retryImport(preloadReorderList).then(module => ({
    default: module.ReorderList as ComponentType<ReorderListProps<unknown>>,
  })),
);

export function LazyReorderList<T>(props: ReorderListProps<T>) {
  const Loaded = ReorderList as unknown as ComponentType<ReorderListProps<T>>;
  return (
    <Suspense fallback={<StaticList {...props} />}>
      <Loaded {...props} />
    </Suspense>
  );
}

const GRIP = (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
    <circle cx="2.5" cy="2.5" r="1.2" />
    <circle cx="7.5" cy="2.5" r="1.2" />
    <circle cx="2.5" cy="7" r="1.2" />
    <circle cx="7.5" cy="7" r="1.2" />
    <circle cx="2.5" cy="11.5" r="1.2" />
    <circle cx="7.5" cy="11.5" r="1.2" />
  </svg>
);

function StaticList<T>({
  items,
  getId,
  children,
  label,
  className = '',
  itemClassName = '',
}: ReorderListProps<T>) {
  return (
    <div className={cn('w-full', className)}>
      <ul aria-label={label} className="m-0 list-none space-y-0.5 p-0">
        {items.map(item => (
          <li
            key={getId(item)}
            className={cn('relative flex items-center gap-1 rounded-lg outline-none', itemClassName)}
          >
            <span
              aria-hidden
              className="flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground/40"
            >
              {GRIP}
            </span>
            <div className="min-w-0 flex-1">{children(item)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
