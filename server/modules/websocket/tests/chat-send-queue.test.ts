import assert from 'node:assert/strict';
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
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';

/*
 * Bug del 30-sep: tres mensajes mandados mientras la sesión respondía
 * volvieron tres veces con "Session ... already has a run in progress." y no
 * quedaron en ningún lado. Un mensaje que llega durante una corrida espera su
 * turno y sale cuando esa corrida termina.
 */

const SESSION_ID = 'queue-session';

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

type Harness = {
  socket: ReturnType<typeof createFakeSocket>;
  commands: string[];
  /** Ends the oldest run still in flight. */
  finishRun: () => void;
  send: (content: string, clientMessageId?: string) => void;
};

async function withGateway(runTest: (harness: Harness) => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'chat-send-queue-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();

  const commands: string[] = [];
  const releases: Array<() => void> = [];
  const socket = createFakeSocket();

  try {
    const now = new Date().toISOString();
    sessionsDb.createSession(SESSION_ID, 'codex', tempDirectory, 'Queue session', now, now);

    handleChatConnection(
      socket as never,
      { user: { id: 1 } } as never,
      {
        runtime: {
          hasRuntime: () => true,
          abort: async () => true,
          // Every run stays in flight until the test ends it; the gateway's
          // safety net then emits its terminal `complete`.
          run: async (_provider: string, command: string) => {
            commands.push(command);
            await new Promise<void>((resolve) => { releases.push(resolve); });
          },
        } as never,
      },
    );

    await runTest({
      socket,
      commands,
      finishRun: () => releases.shift()?.(),
      send: (content, clientMessageId) => {
        socket.emit('message', JSON.stringify({
          type: 'chat.send',
          sessionId: SESSION_ID,
          content,
          ...(clientMessageId ? { clientMessageId } : {}),
        }));
      },
    });
  } finally {
    for (const release of releases) release();
    _resetPendingSendsForTests();
    connectedClients.clear();
    chatRunRegistry.clearAll();
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

/** The handler is async and the socket listener does not await it. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 30); });

const statusesFor = (socket: ReturnType<typeof createFakeSocket>, clientMessageId: string) =>
  socket.frames
    .filter((frame) => frame.kind === 'message_status' && frame.clientMessageId === clientMessageId)
    .map((frame) => frame.status);

test('un mensaje con la sesión libre sale y se confirma como enviado', async () => {
  await withGateway(async ({ socket, commands, send }) => {
    send('hola', 'local_1_a');
    await settle();

    assert.deepEqual(commands, ['hola']);
    assert.deepEqual(statusesFor(socket, 'local_1_a'), ['sent']);
  });
});

test('un mensaje durante una corrida queda en cola, sin error, y sale cuando la corrida termina', async () => {
  await withGateway(async ({ socket, commands, send, finishRun }) => {
    send('primero', 'local_1_a');
    await settle();
    send('segundo', 'local_2_b');
    await settle();

    assert.deepEqual(commands, ['primero'], 'el segundo no arranca mientras el primero corre');
    assert.equal(socket.frames.some((frame) => frame.kind === 'protocol_error'), false);
    const queued = socket.frames.find((frame) => frame.kind === 'message_status' && frame.clientMessageId === 'local_2_b');
    assert.equal(queued?.status, 'queued');
    assert.equal(queued?.position, 1);

    finishRun();
    await settle();

    assert.deepEqual(commands, ['primero', 'segundo']);
    assert.deepEqual(statusesFor(socket, 'local_2_b'), ['queued', 'sent']);
    const sent = socket.frames.find((frame) => frame.kind === 'message_status'
      && frame.clientMessageId === 'local_2_b' && frame.status === 'sent');
    assert.equal(sent?.fromQueue, true);

    // El `complete` de la primera corrida sale antes que el aviso de la segunda.
    const completeIndex = socket.frames.findIndex((frame) => frame.kind === 'complete');
    const sentIndex = socket.frames.indexOf(sent!);
    assert.ok(completeIndex >= 0 && completeIndex < sentIndex);
  });
});

test('varios mensajes en cola salen de a uno y en el orden en que se mandaron', async () => {
  await withGateway(async ({ commands, send, finishRun }) => {
    send('uno', 'local_1_a');
    await settle();
    send('dos', 'local_2_b');
    send('tres', 'local_3_c');
    send('cuatro');
    await settle();
    assert.deepEqual(commands, ['uno']);

    finishRun();
    await settle();
    assert.deepEqual(commands, ['uno', 'dos']);

    finishRun();
    await settle();
    assert.deepEqual(commands, ['uno', 'dos', 'tres']);

    finishRun();
    await settle();
    assert.deepEqual(commands, ['uno', 'dos', 'tres', 'cuatro']);
  });
});

test('detener la corrida no pierde lo que estaba en cola', async () => {
  await withGateway(async ({ socket, commands, send }) => {
    send('largo', 'local_1_a');
    await settle();
    send('después', 'local_2_b');
    await settle();

    socket.emit('message', JSON.stringify({ type: 'chat.abort', sessionId: SESSION_ID }));
    await settle();

    assert.deepEqual(commands, ['largo', 'después']);
    assert.deepEqual(statusesFor(socket, 'local_2_b'), ['queued', 'sent']);
  });
});

test('un clientMessageId fuera de formato no se refleja', async () => {
  await withGateway(async ({ socket, send }) => {
    send('hola', '<script>');
    await settle();
    assert.equal(socket.frames.some((frame) => frame.kind === 'message_status'), false);
  });
});
