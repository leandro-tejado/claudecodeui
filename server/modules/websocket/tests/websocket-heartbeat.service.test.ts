import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { WebSocket } from 'ws';

import {
  attachChatApplicationHeartbeat,
  attachWebSocketHeartbeat,
} from '@/modules/websocket/services/websocket-server.service.js';

function createFakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    pingCount: number;
    terminateCount: number;
    ping: () => void;
    terminate: () => void;
    sent: string[];
    send: (payload: string) => void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.pingCount = 0;
  socket.terminateCount = 0;
  socket.ping = () => {
    socket.pingCount += 1;
  };
  socket.terminate = () => {
    socket.terminateCount += 1;
  };
  socket.sent = [];
  socket.send = (payload: string) => {
    socket.sent.push(payload);
  };
  return socket;
}

function createScheduler() {
  let callback: (() => void) | null = null;
  let wasCleared = false;

  return {
    setInterval(nextCallback: () => void) {
      callback = nextCallback;
      return 1 as unknown as NodeJS.Timeout;
    },
    clearInterval() {
      wasCleared = true;
    },
    tick() {
      callback?.();
    },
    cleared() {
      return wasCleared;
    },
  };
}

test('heartbeat terminates an open socket that does not answer its ping', () => {
  const socket = createFakeSocket();
  const scheduler = createScheduler();
  attachWebSocketHeartbeat(socket as never, 30_000, scheduler);

  scheduler.tick();
  assert.equal(socket.pingCount, 1);
  assert.equal(socket.terminateCount, 0);

  scheduler.tick();
  assert.equal(socket.terminateCount, 1);
  assert.equal(scheduler.cleared(), true);
});

test('heartbeat keeps responsive sockets open and stops after close', () => {
  const socket = createFakeSocket();
  const scheduler = createScheduler();
  attachWebSocketHeartbeat(socket as never, 30_000, scheduler);

  scheduler.tick();
  socket.emit('pong');
  scheduler.tick();

  assert.equal(socket.pingCount, 2);
  assert.equal(socket.terminateCount, 0);

  socket.emit('close');
  assert.equal(scheduler.cleared(), true);
});

// The protocol ping is invisible to a browser's JavaScript, so the client
// watchdog needs a frame it can actually observe to tell a quiet socket from a
// dead one.
test('the chat heartbeat sends an observable frame while the socket is open', () => {
  const socket = createFakeSocket();
  const scheduler = createScheduler();
  attachChatApplicationHeartbeat(socket as never, 25_000, scheduler);

  scheduler.tick();
  scheduler.tick();

  assert.equal(socket.sent.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(socket.sent[0])).sort(), ['kind', 'timestamp']);
  assert.equal(JSON.parse(socket.sent[0]).kind, 'heartbeat');
});

test('the chat heartbeat stays quiet on a closing socket and stops after close', () => {
  const socket = createFakeSocket();
  const scheduler = createScheduler();
  attachChatApplicationHeartbeat(socket as never, 25_000, scheduler);

  socket.readyState = WebSocket.CLOSING;
  scheduler.tick();
  assert.equal(socket.sent.length, 0);

  socket.emit('close');
  assert.equal(scheduler.cleared(), true);
});
