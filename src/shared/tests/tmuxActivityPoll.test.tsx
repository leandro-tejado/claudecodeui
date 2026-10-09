import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { useSessionProtection } from '@/shared/hooks/useSessionProtection';

/**
 * A tmux turn never shows up in the running-sessions poll: the server lists
 * the runs of its own chat registry, and a message typed into a pane is not
 * one. The pane reader keeps the entry alive instead, re-marking it on every
 * `activity` it reads (~400 ms). The poll used to measure its grace from the
 * turn's start, so ten seconds into any tmux turn it dropped the entry — the
 * indicator and its Stop vanished until the next `activity` put them back
 * with a fresh clock (9-oct, e2e probe on :3901: Stop gone at +12.9 s).
 */

const T0 = new Date('2026-10-09T14:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});

afterEach(() => {
  vi.useRealTimers();
});

test('the poll keeps a tmux turn that is still signalling, and its clock', () => {
  const { result } = renderHook(() => useSessionProtection());

  act(() => {
    result.current.markSessionProcessing('tmux-1', { statusText: null, canInterrupt: true });
  });
  // The pane reader re-marks the turn with the same label every few hundred ms.
  for (const ms of [4_000, 8_000, 11_000]) {
    vi.setSystemTime(T0 + ms);
    act(() => {
      result.current.markSessionProcessing('tmux-1', { statusText: null });
    });
  }

  vi.setSystemTime(T0 + 12_000);
  act(() => {
    result.current.syncProcessingSessions([]);
  });

  const activity = result.current.getSessionActivity('tmux-1');
  assert.ok(activity, 'a signal 1 s ago: the turn is alive even if the server does not list it');
  assert.equal(activity?.canInterrupt, true, 'Stop stays');
  assert.equal(activity?.startedAt, T0, 'the elapsed clock keeps counting from the turn start');
});

test('the poll still drops a local entry that went quiet', () => {
  const { result } = renderHook(() => useSessionProtection());

  act(() => {
    result.current.markSessionProcessing('tmux-1', { statusText: null, canInterrupt: true });
  });
  vi.setSystemTime(T0 + 2_000);
  act(() => {
    result.current.markSessionProcessing('tmux-1', { statusText: null });
  });

  vi.setSystemTime(T0 + 13_000);
  act(() => {
    result.current.syncProcessingSessions([]);
  });

  assert.equal(result.current.getSessionActivity('tmux-1'), undefined, 'eleven seconds without a signal and not listed: gone');
});
