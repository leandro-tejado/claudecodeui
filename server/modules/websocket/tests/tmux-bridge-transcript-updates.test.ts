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
  puentearPaneExterno,
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

test(
  'un pane externo (orquestar.py, ct) solo se puentea despues de que el chat le escribio',
  { concurrency: false },
  async () => {
    await withIsolatedDatabase(async () => {
      _resetEstadoParaTests();
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-fixture-'));
      const projectPath = path.join(tempDirectory, 'project');
      await mkdir(projectPath, { recursive: true });
      const sessionId = `session-${randomUUID()}`;
      const jsonlPath = path.join(tempDirectory, `${sessionId}.jsonl`);
      const nombreExterno = `${PREFIX}externo-${randomUUID().slice(0, 8)}`;

      const filaVieja = { type: 'user', uuid: 'u0', sessionId, message: { role: 'user', content: 'historial previo' } };
      await writeFile(jsonlPath, `${JSON.stringify(filaVieja)}\n`, 'utf8');
      sessionsDb.createSession(sessionId, 'claude', projectPath, undefined, undefined, undefined, jsonlPath);
      const session = sessionsDb.getSessionById(sessionId);
      assert.ok(session);

      await execFileAsync('tmux', ['new-session', '-d', '-s', nombreExterno, 'cat']);
      const { socket, received } = fakeClientSocket();
      connectedClients.add(socket);
      try {
        // Vivo pero nunca escrito desde el chat: no se emite nada.
        await manejarActualizacionTranscript(sessionId);
        assert.equal(received.length, 0, 'un pane externo no puenteado no deberia emitir');

        await puentearPaneExterno(session, nombreExterno);

        const filaNueva = {
          type: 'assistant',
          uuid: 'a1',
          sessionId,
          message: { role: 'assistant', content: 'respuesta nueva', stop_reason: 'end_turn' },
        };
        await appendFile(jsonlPath, `${JSON.stringify(filaNueva)}\n`, 'utf8');
        await manejarActualizacionTranscript(sessionId);

        const textos = received
          .filter((event) => (event as { kind?: string }).kind === 'text')
          .map((event) => (event as { content?: string }).content);
        assert.deepEqual(textos, ['respuesta nueva'], 'solo lo posterior al prompt, sin reemitir el historial');
        assert.ok(received.some((event) => (event as { kind?: string }).kind === 'complete'));
      } finally {
        connectedClients.delete(socket);
        await execFileAsync('tmux', ['kill-session', '-t', nombreExterno]).catch(() => undefined);
        await rm(tempDirectory, { recursive: true, force: true });
      }
    });
  },
);

test(
  'user + end_turn en el mismo poll: el primer poll de una sesion ya emite el complete',
  { concurrency: false },
  async () => {
    await withIsolatedDatabase(async () => {
      _resetEstadoParaTests();
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-fixture-'));
      const projectPath = path.join(tempDirectory, 'project');
      await mkdir(projectPath, { recursive: true });
      const sessionId = `session-${randomUUID()}`;
      const jsonlPath = path.join(tempDirectory, `${sessionId}.jsonl`);

      // Fase 7, paso 1: antes, el fin de turno salía de un booleano que
      // "ultimoUsuarioAnunciado" (un uuid, no un booleano) reemplaza. El bug
      // original era con dos polls separados (fila user en uno, end_turn en
      // el siguiente) cuando el booleano quedaba mal seteado; esto cubre el
      // caso más extremo — las DOS filas ya están ahí en el primerísimo
      // poll que esta sesión ve, sin ningún estado previo en memoria.
      const filaUsuario = { type: 'user', uuid: 'u1', sessionId, message: { role: 'user', content: 'hola' } };
      const filaAssistant = {
        type: 'assistant',
        uuid: 'a1',
        sessionId,
        message: { role: 'assistant', content: 'hola de vuelta', stop_reason: 'end_turn' },
      };
      await writeFile(jsonlPath, `${JSON.stringify(filaUsuario)}\n${JSON.stringify(filaAssistant)}\n`, 'utf8');
      sessionsDb.createSession(sessionId, 'claude', projectPath, undefined, undefined, undefined, jsonlPath);

      const nombreSesion = nombreTmux(projectPath, sessionId);
      await execFileAsync('tmux', ['new-session', '-d', '-s', nombreSesion, 'cat']);

      const { socket, received } = fakeClientSocket();
      connectedClients.add(socket);
      try {
        await manejarActualizacionTranscript(sessionId);

        const kinds = received.map((event) => (event as { kind?: string }).kind);
        assert.ok(kinds.includes('text'), `esperaba una fila 'text', llegaron: ${kinds.join(',')}`);
        assert.ok(
          kinds.includes('complete'),
          `esperaba 'complete' ya en el primer poll (user + end_turn juntos), llegaron: ${kinds.join(',')}`,
        );

        received.length = 0;
        // Un segundo poll sin cambios no debe repetir nada.
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
