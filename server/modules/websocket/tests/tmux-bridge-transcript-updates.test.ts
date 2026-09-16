import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { WebSocket } from 'ws';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';
import {
  _resetEstadoParaTests,
  manejarActualizacionTranscript,
} from '@/modules/websocket/services/tmux-bridge.service.js';
import { nombreTmux } from '@/modules/websocket/services/shell-websocket.service.js';

const execFileAsync = promisify(execFile);
const PREFIX = 'fase3-test-';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-watcher-db-'));

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function fakeClientSocket() {
  const received: unknown[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send(payload: string) {
      received.push(JSON.parse(payload));
    },
  } as unknown as WebSocket;
  return { socket, received };
}

test(
  'una sesion sin pane de tmux vivo no emite nada, aunque el jsonl cambie',
  { concurrency: false },
  async () => {
    await withIsolatedDatabase(async () => {
      _resetEstadoParaTests();
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-fixture-'));
      const projectPath = path.join(tempDirectory, 'project');
      await mkdir(projectPath, { recursive: true });
      const sessionId = `session-${randomUUID()}`;
      const jsonlPath = path.join(tempDirectory, `${sessionId}.jsonl`);

      await writeFile(
        jsonlPath,
        `${JSON.stringify({ type: 'user', uuid: 'u1', sessionId, message: { role: 'user', content: 'hola' } })}\n`,
        'utf8',
      );
      sessionsDb.createSession(sessionId, 'claude', projectPath, undefined, undefined, undefined, jsonlPath);

      const { socket, received } = fakeClientSocket();
      connectedClients.add(socket);
      try {
        await manejarActualizacionTranscript(sessionId);
        assert.equal(received.length, 0, 'no deberia emitir nada sin una sesion de tmux viva');
      } finally {
        connectedClients.delete(socket);
        await rm(tempDirectory, { recursive: true, force: true });
      }
    });
  },
);

test(
  'una sesion bridged emite las filas nuevas y un complete al cerrar el turno',
  { concurrency: false },
  async () => {
    await withIsolatedDatabase(async () => {
      _resetEstadoParaTests();
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-fixture-'));
      const projectPath = path.join(tempDirectory, 'project');
      await mkdir(projectPath, { recursive: true });
      const sessionId = `session-${randomUUID()}`;
      const jsonlPath = path.join(tempDirectory, `${sessionId}.jsonl`);

      const filaUsuario = {
        type: 'user',
        uuid: 'u1',
        sessionId,
        message: { role: 'user', content: 'hola' },
      };
      await writeFile(jsonlPath, `${JSON.stringify(filaUsuario)}\n`, 'utf8');
      sessionsDb.createSession(sessionId, 'claude', projectPath, undefined, undefined, undefined, jsonlPath);

      const nombreSesion = nombreTmux(projectPath, sessionId);
      await execFileAsync('tmux', ['new-session', '-d', '-s', nombreSesion, 'cat']);

      const { socket, received } = fakeClientSocket();
      connectedClients.add(socket);
      try {
        // Primera pasada: todavia no hay `result`, asi que se emite la fila
        // nueva pero ningun `complete`.
        await manejarActualizacionTranscript(sessionId);
        assert.ok(received.length >= 1, 'deberia emitir la fila de usuario');
        assert.ok(
          !received.some((event) => (event as { kind?: string }).kind === 'complete'),
          'no deberia haber complete todavia',
        );

        received.length = 0;

        // El pane "responde": se agrega la fila del assistant que cierra el
        // turno. Claude Code no escribe una fila `result` en el `.jsonl` del
        // proyecto (verificado 16-sep contra una transcripcion real de este
        // VPS) — el cierre de turno se lee de `message.stop_reason` en la
        // ultima fila `assistant`.
        const filaAssistant = {
          type: 'assistant',
          uuid: 'a1',
          sessionId,
          message: { role: 'assistant', content: 'hola de vuelta', stop_reason: 'end_turn' },
        };
        await appendFile(jsonlPath, `${JSON.stringify(filaAssistant)}\n`, 'utf8');

        await manejarActualizacionTranscript(sessionId);

        const kinds = received.map((event) => (event as { kind?: string }).kind);
        assert.ok(kinds.includes('text'), `esperaba una fila 'text' nueva, llegaron: ${kinds.join(',')}`);
        assert.ok(kinds.includes('complete'), `esperaba 'complete', llegaron: ${kinds.join(',')}`);

        const completeEvent = received.find((event) => (event as { kind?: string }).kind === 'complete') as
          | { sessionId?: string }
          | undefined;
        assert.equal(completeEvent?.sessionId, sessionId);

        received.length = 0;

        // Un segundo poll sin cambios no debe repetir el `complete`.
        await manejarActualizacionTranscript(sessionId);
        assert.equal(received.length, 0, 'no deberia repetir el complete sin actividad nueva');
      } finally {
        connectedClients.delete(socket);
        await execFileAsync('tmux', ['kill-session', '-t', nombreSesion]).catch(() => undefined);
        await rm(tempDirectory, { recursive: true, force: true });
      }
    });
  },
);
