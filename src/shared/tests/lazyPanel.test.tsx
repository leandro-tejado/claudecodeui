import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { LazyPanel } from '@/shared/ui/LazyPanel';

/**
 * The point of LazyPanel is the handoff: skeleton while the module is in flight,
 * real panel once it lands, and no blank frame in between. These tests drive that
 * handoff by hand with a promise the test resolves, because a real dynamic import
 * resolves before the first assertion can run.
 */
describe('LazyPanel', () => {
  it('shows the skeleton first and the panel once the module lands', async () => {
    let land: (() => void) | undefined;
    const arrived = new Promise<void>(resolve => {
      land = resolve;
    });

    const Deferred = React.lazy(async () => {
      await arrived;
      return { default: () => <div>terminal lista</div> };
    });

    render(
      <LazyPanel variant="terminal">
        <Deferred />
      </LazyPanel>
    );

    expect(screen.getByTestId('lazy-panel-skeleton')).toBeTruthy();
    expect(screen.queryByText('terminal lista')).toBeNull();

    land?.();

    await waitFor(() => {
      expect(screen.getByText('terminal lista')).toBeTruthy();
    });
    expect(screen.queryByTestId('lazy-panel-skeleton')).toBeNull();
  });

  it('renders a custom fallback instead of the skeleton when given one', () => {
    const Never = React.lazy(() => new Promise<{ default: React.ComponentType }>(() => {}));

    render(
      <LazyPanel fallback={<div>cargando el editor</div>}>
        <Never />
      </LazyPanel>
    );

    expect(screen.getByText('cargando el editor')).toBeTruthy();
    expect(screen.queryByTestId('lazy-panel-skeleton')).toBeNull();
  });

  it('marks the skeleton busy so assistive tech does not read the empty frame', () => {
    const Never = React.lazy(() => new Promise<{ default: React.ComponentType }>(() => {}));

    render(
      <LazyPanel variant="editor">
        <Never />
      </LazyPanel>
    );

    expect(screen.getByTestId('lazy-panel-skeleton').getAttribute('aria-busy')).toBe('true');
  });
});
