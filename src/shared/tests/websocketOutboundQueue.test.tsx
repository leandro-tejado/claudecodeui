import assert from 'node:assert/strict';

import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';

/**
 * A "sesión trabada" report (17-sep, Fase 6 of
 * `17-septiembre-ux-sesiones-y-cuota.md`) traced back to this: `sendMessage`
 * used to fail silently whenever the socket wasn't OPEN yet — most visibly
 * the up-to-3s gap between a drop and the scheduled reconnect. A tool-
 * permission "approve" clicked in that window never reached the server, and
 * the prompt was cleared from local state regardless, leaving nothing on
 * screen to retry. These tests pin the fix: such a send is queued and
 * flushed, in order, on the next successful open.
 */

const encodeSegment = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const buildToken = () => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = { userId: 1, username: 'leandro', iat: issuedAt, exp: issuedAt + 365 * 24 * 3600 };
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(payload)}.signature`;
};

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

  readyState: number = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

let sendMessageRef: ((message: unknown) => void) | null = null;

const renderProvider = async () => {
  const { WebSocketProvider, useWebSocket } = await import('@/shared/context/WebSocketContext');

  const Consumer = () => {
    const { sendMessage } = useWebSocket();
    sendMessageRef = sendMessage;
    return null;
  };

  return render(React.createElement(WebSocketProvider, null, React.createElement(Consumer)));
};

const openLatestSocket = () => {
  const socket = FakeWebSocket.instances.at(-1);
  assert.ok(socket);
  socket.readyState = FakeWebSocket.OPEN;
  act(() => socket.onopen?.());
  return socket;
};

beforeEach(() => {
  FakeWebSocket.instances = [];
  sendMessageRef = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('a message sent while reconnecting is queued and flushed on the next open, in order', async () => {
  await renderProvider();
  const first = openLatestSocket();
  assert.ok(sendMessageRef);

  // Drop the socket without a replacement yet — the 3s gap before `connect()`
  // fires again is exactly the window the silent-failure bug lived in.
  act(() => first.onclose?.());

  sendMessageRef?.({ type: 'chat.permission-response', requestId: 'a', allow: true });
  sendMessageRef?.({ type: 'chat.permission-response', requestId: 'b', allow: false });
  assert.equal(first.sent.length, 0, 'nothing reaches the dead socket');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  assert.equal(FakeWebSocket.instances.length, 2, 'the scheduled reconnect opened a replacement');
  const second = openLatestSocket();

  assert.deepEqual(
    second.sent.map((raw) => JSON.parse(raw).requestId),
    ['a', 'b'],
    'both queued messages are flushed, oldest first',
  );
});

test('a message sent while genuinely connected is never queued', async () => {
  await renderProvider();
  const socket = openLatestSocket();

  sendMessageRef?.({ type: 'chat.abort', sessionId: 'x' });

  assert.equal(socket.sent.length, 1, 'sent immediately, not deferred to a later flush');
});
