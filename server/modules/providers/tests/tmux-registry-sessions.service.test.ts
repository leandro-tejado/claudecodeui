import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getConnection } from '@/modules/database/connection.js';
import { closeConnection, initializeDatabase, projectsDb, sessionsDb } from '@/modules/database/index.js';
import { getProjectsWithSessions, invalidarRegistroSesiones } from '@/modules/projects/index.js';
import {
  buscarPaneTmuxRegistrado,
  esFilaTmuxSinTranscript,
  sincronizarSesionesTmuxSinTranscript,
} from '@/modules/providers/services/tmux-registry-sessions.service.js';

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
    assert.deepEqual(result, { indexadas: [SESSION_ID], reactivadas: [], podadas: 0 });

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

    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], reactivadas: [], podadas: 0 });
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], reactivadas: [], podadas: 0 });
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
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], reactivadas: [], podadas: 0 });
    assert.ok(sessionsDb.getSessionById(SESSION_ID), 'registro ausente no es "murieron todas"');

    await escribirRegistro({ 'os-guia-1': entrada({ estado: 'caida' }) });
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], reactivadas: [], podadas: 1 });
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
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], reactivadas: [], podadas: 0 });
  });
});

test('una entrada recién escrita por el hook, sin cwd, se indexa con el cwd del pane vivo', async () => {
  await withEntorno(async (escribirRegistro) => {
    const { cwd: _omitido, ...sinCwd } = entrada();
    await escribirRegistro({ 'os-guia-1': sinCwd });

    const consultados: string[] = [];
    const cwdDePane = async (nombre: string) => {
      consultados.push(nombre);
      return PROJECT_PATH;
    };
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript({ cwdDePane }), { indexadas: [SESSION_ID], reactivadas: [], podadas: 0 });
    assert.deepEqual(consultados, ['os-guia-1']);
    assert.equal(sessionsDb.getSessionById(SESSION_ID)?.project_path, PROJECT_PATH);

    // Ya indexada: la segunda pasada no vuelve a preguntarle a tmux.
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript({ cwdDePane }), { indexadas: [], reactivadas: [], podadas: 0 });
    assert.deepEqual(consultados, ['os-guia-1']);
  });
});

test('sin cwd y sin pane que responda no se indexa, pero tampoco se poda una fila viva', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    await sincronizarSesionesTmuxSinTranscript();

    const { cwd: _omitido, ...sinCwd } = entrada();
    const otroId = '22222222-3333-4444-5555-666666666666';
    await escribirRegistro({
      'os-guia-1': sinCwd,
      'os-guia-2': { ...sinCwd, nombre: 'os-guia-2', session_id: otroId },
    });
    const sinPane = async () => null;
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript({ cwdDePane: sinPane }), { indexadas: [], reactivadas: [], podadas: 0 });
    assert.ok(sessionsDb.getSessionById(SESSION_ID));
    assert.ok(!sessionsDb.getSessionById(otroId));
  });
});

test('sin cwd, un nombre fuera de charset no llega nunca a tmux', async () => {
  await withEntorno(async (escribirRegistro) => {
    const { cwd: _omitido, ...sinCwd } = entrada({ nombre: 'os;rm -rf ~' });
    await escribirRegistro({ x: sinCwd });
    let llamadas = 0;
    const cwdDePane = async () => {
      llamadas += 1;
      return PROJECT_PATH;
    };
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript({ cwdDePane }), { indexadas: [], reactivadas: [], podadas: 0 });
    assert.equal(llamadas, 0);
  });
});

test('buscarPaneTmuxRegistrado: devuelve el nombre de tmux de la sesión viva, por cualquiera de sus ids', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    assert.equal(buscarPaneTmuxRegistrado([SESSION_ID]), 'os-guia-1');
    assert.equal(buscarPaneTmuxRegistrado([null, 'otro-id', SESSION_ID]), 'os-guia-1');
    assert.equal(buscarPaneTmuxRegistrado(['otro-id']), null);
    assert.equal(buscarPaneTmuxRegistrado([]), null);
  });
});

test('buscarPaneTmuxRegistrado: ignora entradas muertas y nombres fuera de charset', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada({ estado: 'muerta' }) });
    assert.equal(buscarPaneTmuxRegistrado([SESSION_ID]), null);

    await escribirRegistro({ x: entrada({ nombre: 'os;rm -rf ~' }) });
    assert.equal(buscarPaneTmuxRegistrado([SESSION_ID]), null);

    await escribirRegistro(null);
    assert.equal(buscarPaneTmuxRegistrado([SESSION_ID]), null);
  });
});

test('esFilaTmuxSinTranscript: reconoce la fila pendiente y no la de una sesión nacida en CloudCLI', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    await sincronizarSesionesTmuxSinTranscript();
    const pendiente = sessionsDb.getSessionById(SESSION_ID);
    assert.ok(pendiente);
    assert.equal(esFilaTmuxSinTranscript(pendiente), true);

    const appId = '11111111-2222-3333-4444-555555555555';
    sessionsDb.createAppSession(appId, 'claude', PROJECT_PATH, 'hola');
    const deApp = sessionsDb.getSessionById(appId);
    assert.ok(deApp);
    assert.equal(esFilaTmuxSinTranscript(deApp), false);
  });
});

/*
 * Fase 3 de `05-octubre-limpieza-barra-viva.md`: caso `fiesta-music`. El
 * proyecto quedó archivado (por la limpieza o a mano) y después se abrió una
 * sesión nueva en él: la sesión viva del registro tiene que traerlo de vuelta.
 */

/** Archiva el proyecto con una fecha fija, para no depender del reloj. */
function archivarProyecto(projectPath: string, archivedAt: string): void {
  projectsDb.createProjectPath(projectPath);
  projectsDb.updateProjectIsArchived(projectPath, true, 'auto');
  getConnection()
    .prepare('UPDATE projects SET archived_at = ? WHERE project_path = ?')
    .run(archivedAt, projectPath);
}

test('fiesta-music: una sesión viva nueva en un proyecto archivado lo desarchiva y se anuncia', async () => {
  await withEntorno(async (escribirRegistro) => {
    archivarProyecto(PROJECT_PATH, '2026-09-01 00:00:00');
    assert.equal(projectsDb.getProjectPath(PROJECT_PATH)?.isArchived, 1);

    await escribirRegistro({ 'os-guia-1': entrada() });
    const result = await sincronizarSesionesTmuxSinTranscript();

    // `indexadas` es lo que el watcher encola como `session_upserted`.
    assert.deepEqual(result.indexadas, [SESSION_ID]);
    const proyecto = projectsDb.getProjectPath(PROJECT_PATH);
    assert.equal(proyecto?.isArchived, 0);
    assert.equal(proyecto?.archived_at ?? null, null);
    assert.equal(proyecto?.archived_by ?? null, null);

    const projects = await getProjectsWithSessions({ skipSynchronization: true });
    assert.ok(projects.find((candidate) => candidate.path === PROJECT_PATH)?.sessions.some((s) => s.id === SESSION_ID));
  });
});

test('una fila que ya existía y solo se reactiva también sale en `reactivadas`', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    await sincronizarSesionesTmuxSinTranscript();

    // La limpieza la archivó (y a su proyecto) antes de que la sesión
    // registrara actividad: la fila existe, está archivada, y es más nueva.
    sessionsDb.updateSessionIsArchived(SESSION_ID, true, 'auto');
    getConnection().prepare("UPDATE sessions SET archived_at = '2026-01-01 00:00:00' WHERE session_id = ?").run(SESSION_ID);
    archivarProyecto(PROJECT_PATH, '2026-01-01 00:00:00');

    const result = await sincronizarSesionesTmuxSinTranscript();

    assert.deepEqual(result, { indexadas: [], reactivadas: [SESSION_ID], podadas: 0 });
    const row = sessionsDb.getSessionById(SESSION_ID);
    assert.equal(row?.isArchived, 0);
    assert.equal(row?.archived_at ?? null, null);
    assert.equal(row?.archived_by ?? null, null);
    assert.equal(projectsDb.getProjectPath(PROJECT_PATH)?.isArchived, 0);

    // Ya activa: la siguiente pasada no vuelve a anunciarla.
    assert.deepEqual(await sincronizarSesionesTmuxSinTranscript(), { indexadas: [], reactivadas: [], podadas: 0 });
  });
});

test('una fila archivada DESPUÉS de su última actividad no se reactiva por seguir en el registro', async () => {
  await withEntorno(async (escribirRegistro) => {
    await escribirRegistro({ 'os-guia-1': entrada() });
    await sincronizarSesionesTmuxSinTranscript();

    sessionsDb.updateSessionIsArchived(SESSION_ID, true, 'user');
    // `creada` del registro es de 2026-09-25: archivada después, sin actividad nueva.
    getConnection().prepare("UPDATE sessions SET archived_at = '2026-10-01 00:00:00' WHERE session_id = ?").run(SESSION_ID);

    const result = await sincronizarSesionesTmuxSinTranscript();

    assert.deepEqual(result, { indexadas: [], reactivadas: [], podadas: 0 });
    assert.equal(sessionsDb.getSessionById(SESSION_ID)?.isArchived, 1);
  });
});
