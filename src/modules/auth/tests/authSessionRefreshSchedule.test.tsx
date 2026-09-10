import assert from 'node:assert/strict';

import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';

/**
 * `setTimeout` stores its delay in a signed 32-bit integer, so any wait past
 * ~24.8 days overflows and the timer fires on the next tick instead. With
 * JWT_EXPIRES_IN=365d the scheduled refresh sits at half the token lifetime —
 * 182 days — so it fired immediately, minted a new token, and the new token
 * rearmed the timer: an endless refresh loop. Every turn of that loop tore the
 * chat websocket down and back up, which is why sending a message only worked
 * right after a page reload.
 *
 * These tests pin the schedule itself: a long-lived token must not be refreshed
 * on mount, and one that is genuinely past its half-life still must be.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const encodeSegment = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A token shaped like the ones the server signs: `iat`/`exp` in seconds. */
const buildToken = ({ issuedMsAgo, lifetimeMs }: { issuedMsAgo: number; lifetimeMs: number }) => {
  const issuedAt = Math.floor((Date.now() - issuedMsAgo) / 1000);
  const payload = { userId: 1, username: 'leandro', iat: issuedAt, exp: issuedAt + Math.floor(lifetimeMs / 1000) };
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(payload)}.signature`;
};

const refresh = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ token: buildToken({ issuedMsAgo: 0, lifetimeMs: 365 * DAY_MS }) }) }));

vi.mock('@/shared/api', () => ({
  api: {
    auth: {
      status: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: false }) }),
      user: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ user: { id: 1, username: 'leandro' } }) }),
      refresh: () => refresh(),
    },
    user: {
      onboardingStatus: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ hasCompletedOnboarding: true }) }),
      preferences: () => Promise.resolve({ ok: false }),
      drafts: () => Promise.resolve({ ok: false }),
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderAuth = async (token: string) => {
  localStorage.setItem('auth-token', token);
  const { AuthProvider, useAuth } = await import('@/modules/auth/context/AuthContext');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children);
  return renderHook(() => useAuth(), { wrapper });
};

beforeEach(() => {
  refresh.mockClear();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

test('a 365-day token is not refreshed on mount', async () => {
  const { result } = await renderAuth(buildToken({ issuedMsAgo: HOUR_MS, lifetimeMs: 365 * DAY_MS }));

  // The timer is armed once the session has a user, so waiting for that is
  // what makes the assertion below meaningful.
  await waitFor(() => assert.ok(result.current.user));
  // Well past the tick the overflowed timer fired on. Deliberately not wrapped
  // in `act`: the point is to let real time pass with no pending update to
  // flush, and `act` would wait for the session's own hydration instead.
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(refresh.mock.calls.length, 0, 'a token with 182 days left must not be refreshed yet');
});

test('a token past half its lifetime is still refreshed', async () => {
  const { result } = await renderAuth(buildToken({ issuedMsAgo: 5 * DAY_MS, lifetimeMs: 8 * DAY_MS }));

  await waitFor(() => assert.ok(result.current.user));
  await waitFor(() => assert.equal(refresh.mock.calls.length, 1));
});
