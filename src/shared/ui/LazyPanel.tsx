import * as React from 'react';

import { cn } from '@/shared/utils';

type LazyPanelProps = {
  children: React.ReactNode;
  /** Shape of the placeholder. Terminals and editors read very differently while empty. */
  variant?: 'terminal' | 'editor' | 'plain';
  /** Replaces the built-in skeleton entirely when a caller needs its own shape. */
  fallback?: React.ReactNode;
  className?: string;
};

/**
 * Suspense boundary for a panel whose module is loaded on demand.
 *
 * The skeleton exists so the deferred panel does not open onto blank space. It
 * draws the frame the real panel will occupy — chrome bar, body, and for the
 * editor a gutter — at the same size, so nothing jumps when the module lands.
 * It is deliberately static: a spinner on a panel that usually resolves in under
 * a frame reads as a stutter, and this one is behind a network fetch only the
 * first time.
 */
export function LazyPanel({ children, variant = 'plain', fallback, className }: LazyPanelProps) {
  return (
    <React.Suspense fallback={fallback ?? <PanelSkeleton variant={variant} className={className} />}>
      {children}
    </React.Suspense>
  );
}

function PanelSkeleton({ variant, className }: { variant: 'terminal' | 'editor' | 'plain'; className?: string }) {
  return (
    <div
      data-testid="lazy-panel-skeleton"
      aria-busy="true"
      className={cn('flex h-full w-full flex-col overflow-hidden bg-background', className)}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-3 w-12 rounded bg-muted/60" />
      </div>
      <div className="flex min-h-0 flex-1">
        {variant === 'editor' && (
          <div className="flex w-10 shrink-0 flex-col gap-2 border-r border-border px-2 py-3">
            {LINE_WIDTHS.map((_, index) => (
              <div key={index} className="h-2 w-4 rounded bg-muted/50" />
            ))}
          </div>
        )}
        <div className={cn('flex min-w-0 flex-1 flex-col gap-2 p-3', variant === 'terminal' && 'font-mono')}>
          {LINE_WIDTHS.map((width, index) => (
            <div key={index} className="h-2 rounded bg-muted/50" style={{ width }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Uneven on purpose: equal bars read as a loading bar, ragged ones as text.
const LINE_WIDTHS = ['58%', '81%', '44%', '72%', '35%', '64%'];
