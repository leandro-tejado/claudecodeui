import assert from 'node:assert/strict';

import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';

/**
 * A socket can die without the browser noticing — a suspended laptop, a network
 * change, a re-established tunnel. No close frame arrives, so `readyState` stays
 * OPEN, `send()` reports no error and `onclose` never fires. The tab looks
 * connected, silently is not, and only a page reload brings it back.
 *
 * These tests pin the watchdog that replaces such a socket: it must act on
 * silence alone, and must not touch a socket that is merely idle between
 * heartbeats.
 */

const encodeSegment = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const buildToken = () => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = { userId: 1, username: 'leandro', iat: issuedAt, exp: issuedAt + 365 * 24 * 3600 };
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(payload)}.signature`;
};

// Stable identities on purpose: a fresh object per render would change the
// connect effect's dependencies and recycle the socket on its own, hiding the
// very behaviour under test.
const AUTH_STATE = { isLoading: false, token: buildToken(), user: { username: 'leandro' } };

vi.mock('@/modules/auth', () => ({
  useAuth: () => AUTH_STATE,
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  // Real sockets start out connecting; the watchdog only judges open ones.
  readyState: number = FakeWebSocket.CONNECTING;
  closeCount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send() {}

  close() {
    this.closeCount += 1;
    this.readyState = FakeWebSocket.CLOSED;
  }
}

const renderProvider = async () => {
  const { WebSocketProvider } = await import('@/shared/context/WebSocketContext');
  return render(React.createElement(WebSocketProvider, null, React.createElement('div')));
};

/** Opens the socket the provider just created, as a real server would. */
const openLatestSocket = () => {
  const socket = FakeWebSocket.instances.at(-1);
  assert.ok(socket);
  socket.readyState = FakeWebSocket.OPEN;
  act(() => socket.onopen?.());
  return socket;
};

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('a socket that goes silent past the heartbeat window is replaced', async () => {
  await renderProvider();
  const dead = openLatestSocket();
  assert.equal(FakeWebSocket.instances.length, 1);

  // 80s with no frame at all: well past the 70s the client waits for a
  // heartbeat the server sends every 25s.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(80_000);
  });

  assert.equal(dead.closeCount, 1, 'the dead socket must be closed');
  assert.equal(FakeWebSocket.instances.length, 2, 'a replacement must be opened');
});

test('a socket receiving heartbeats is left alone', async () => {
  await renderProvider();
  const socket = openLatestSocket();

  // Four heartbeats at the server's real cadence, spanning past the timeout.
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    act(() => socket.onmessage?.({ data: JSON.stringify({ kind: 'heartbeat', timestamp: Date.now() }) }));
  }

  assert.equal(socket.closeCount, 0, 'a socket proving it is alive must not be recycled');
  assert.equal(FakeWebSocket.instances.length, 1);
});
