import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { getProjectsWithSessions, invalidarRegistroSesiones } from '@/modules/projects/index.js';
import { sincronizarSesionesTmuxSinTranscript } from '@/modules/providers/services/tmux-registry-sessions.service.js';

/*
 * Bug del 25-sep: una sesión abierta por `orquestar.py` (o `ct`) que todavía
 * no recibió un prompt no tiene `.jsonl`, y el sidebar solo conocía sesiones
 * con transcript. El registro de tmux ya sabe su `session_id`.
 */

const SESSION_ID = '3f521bd6-e9e1-4529-a32a-221acef96a89';
const PROJECT_PATH = '/tmp/tmux-registry-sessions-project';

type Registro = Record<string, Record<string, unknown>>;

function entrada(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nombre: 'os-guia-1',
    cwd: PROJECT_PATH,
    rol: 'guia',
    session_id: SESSION_ID,
    creada: 1790341578,
    estado: 'viva',
    ...overrides,
  };
}

async function withEntorno(runTest: (escribirRegistro: (registro: Registro | null) => Promise<void>) => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousRegistroPath = process.env.AOS_SESIONES_REGISTRO_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'tmux-registry-sessions-'));
  const registroPath = path.join(tempDirectory, 'sesiones.json');

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  process.env.AOS_SESIONES_REGISTRO_PATH = registroPath;
  await initializeDatabase();

  const escribirRegistro = async (registro: Registro | null) => {
    if (registro === null) {
      await rm(registroPath, { force: true });
    } else {
      await writeFile(registroPath, JSON.stringify(registro));
    }
    invalidarRegistroSesiones();
  };

  try {
    await runTest(escribirRegistro);
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousRegistroPath === undefined) delete process.env.AOS_SESIONES_REGISTRO_PATH;
    else process.env.AOS_SESIONES_REGISTRO_PATH = previousRegistroPath;
    invalidarRegistroSesiones();
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('una sesión viva en tmux sin transcript aparece en el listado del sidebar, con tmux vivo', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });

    const result = await sincronizarSesionesTmuxSinTranscript();
    assert.deepEqual(result, { indexadas: [SESSION_ID], podadas: 0 });

    const projects = await getProjectsWithSessions({ skipSynchronization: true });
    const project = projects.find((candidate) => candidate.path === PROJECT_PATH);
    assert.ok(project, 'el proyecto de la sesión tiene que existir');
    const session = project.sessions.find((candidate) => candidate.id === SESSION_ID);
    assert.ok(session, 'la sesión tiene que estar en el listado');
    assert.deepEqual(session.tmux, { nombre: 'os-guia-1', vivo: true });
    assert.equal(session.summary, 'os-guia-1');
  });
});

test('es idempotente y no duplica una sesión que ya tiene fila (nacida en CloudCLI con --session-id)', async () => {
  await withEntorno(async (escribirRegistro) => {
    sessionsDb.createAppSession(SESSION_ID, 'claude', PROJECT_PATH, 'hola');
    await escribirRegistro({ 'os-guia-1': entrada() });

    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], podadas: 0 });
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], podadas: 0 });
    assert.equal(sessionsDb.getSessionById(SESSION_ID)?.custom_name, 'hola');
  });
});

test('cuando aparece el transcript, el synchronizer completa la misma fila y reemplaza el nombre de tmux', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    await sincronizarSesionesTmuxSinTranscript();

    const returnedId = sessionsDb.createSession(
      SESSION_ID, 'claude', PROJECT_PATH, 'Título real', undefined, undefined, '/tmp/x/3f521bd6.jsonl',
    );
    assert.equal(returnedId, SESSION_ID);
    const row = sessionsDb.getSessionById(SESSION_ID);
    assert.equal(row?.jsonl_path, '/tmp/x/3f521bd6.jsonl');
    assert.equal(row?.custom_name, 'Título real');

    // Ya con transcript, la poda no la toca aunque el tmux muera.
    await escribirRegistro({ 'os-guia-1': entrada({ estado: 'caida' }) });
    assert.equal((await sincronizarSesionesTmuxSinTranscript()).podadas, 0);
    assert.ok(sessionsDb.getSessionById(SESSION_ID));
  });
});

test('una sesión que muere sin transcript se poda; sin registro legible no se poda nada', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    await sincronizarSesionesTmuxSinTranscript();

    await escribirRegistro(null);
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], podadas: 0 });
    assert.ok(sessionsDb.getSessionById(SESSION_ID), 'registro ausente no es "murieron todas"');

    await escribirRegistro({ 'os-guia-1': entrada({ estado: 'caida' }) });
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], podadas: 1 });
    assert.ok(!sessionsDb.getSessionById(SESSION_ID));
  });
});

test('ignora entradas sin session_id válido o sin cwd absoluto', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({
      a: entrada({ session_id: null }),
      b: entrada({ session_id: 'no-es-un-uuid' }),
      c: entrada({ cwd: 'relativo' }),
    });
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], podadas: 0 });
  });
});
