import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import {
  _resetPendingSendsForTests,
  handleChatConnection,
} from '@/modules/websocket/services/chat-websocket.service.js';
import { chatRunRegistry } from '@/modules/websocket/services/chat-run-registry.service.js';
import { nombreTmux } from '@/modules/websocket/services/shell-websocket.service.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';

/*
 * 9-oct: "bueno dale" en una sesión recién creada desde CloudCLI volvió con
 * "Esta sesión corre en una terminal tmux viva…". El pane de una sesión nueva
 * nace con su primer `chat.send-tmux`; un `chat.subscribe` que llega antes de
 * que termine `tmux new-session` dice `runsInTmux: false`, y desde ahí el
 * cliente mandaba todo por `chat.send`, que con el pane vivo se rechazaba.
 * El server es el que sabe que hay pane: lo entrega por ahí, nunca por SDK,
 * y el `sent` le dice al cliente que la sesión es de tmux.
 */

const SESSION_ID = 'c6963869-pane-vivo-test';

function createFakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    frames: Array<Record<string, unknown>>;
    send: (data: string) => void;
  };
  socket.readyState = 1;
  socket.frames = [];
  socket.send = (data: string) => socket.frames.push(JSON.parse(data) as Record<string, unknown>);
  return socket;
}

test('a chat.send to a session with a live pane goes to the pane, not to a new SDK run', async () => {
  const previous = { db: process.env.DATABASE_PATH, tmpdir: process.env.TMUX_TMPDIR, tmux: process.env.TMUX };
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'chat-send-pane-vivo-'));
  // Own tmux server: never the socket of the sessions running on this machine.
  process.env.TMUX_TMPDIR = tempDirectory;
  delete process.env.TMUX;
  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();

  const runs: string[] = [];
  const socket = createFakeSocket();
  const pane = nombreTmux(tempDirectory, SESSION_ID);

  try {
    const now = new Date().toISOString();
    sessionsDb.createSession(SESSION_ID, 'claude', tempDirectory, 'Pane vivo', now, now);
    execFileSync('tmux', ['new-session', '-d', '-s', pane, '-c', tempDirectory, 'sleep 30']);

    handleChatConnection(socket as never, { user: { id: 1 } } as never, {
      runtime: {
        hasRuntime: () => true,
        abort: async () => true,
        run: async (_provider: string, command: string) => { runs.push(command); },
      } as never,
    });

    socket.emit('message', JSON.stringify({ type: 'chat.send', sessionId: SESSION_ID, content: 'bueno dale', clientMessageId: 'm1' }));
    await new Promise((resolve) => { setTimeout(resolve, 300); });

    const errores = socket.frames.filter((frame) => frame.kind === 'protocol_error').map((frame) => frame.code);
    assert.ok(!errores.includes('TMUX_PANE_VIVO'), `no refusal for a live pane (got ${errores.join(', ') || 'none'})`);
    assert.deepEqual(runs, [], 'never a second SDK run next to the pane');
  } finally {
    try { execFileSync('tmux', ['kill-server']); } catch { /* ya no estaba */ }
    _resetPendingSendsForTests();
    connectedClients.clear();
    chatRunRegistry.clearAll();
    closeConnection();
    for (const [key, value] of [['DATABASE_PATH', previous.db], ['TMUX_TMPDIR', previous.tmpdir], ['TMUX', previous.tmux]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
