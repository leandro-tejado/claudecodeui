import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getConnection } from '@/modules/database/connection.js';
import { closeConnection, initializeDatabase, projectsDb, sessionsDb } from '@/modules/database/index.js';
import { ClaudeSessionSynchronizer } from '@/modules/providers/list/claude/claude-session-synchronizer.provider.js';

/**
 * Fase 3 de `05-octubre-limpieza-barra-viva.md`: un upsert del synchronizer
 * con actividad posterior a `archived_at` desarchiva la sesión y su proyecto;
 * un re-escaneo de algo viejo, o una sesión headless, no.
 */

const PROJECT_PATH = '/workspace/demo-project';
const ARCHIVADO = '2026-10-01 00:00:00';
const ANTES = new Date('2026-09-20T10:00:00.000Z');
const DESPUES = new Date('2026-10-03T10:00:00.000Z');

async function withIsolatedEnvironment(
  runTest: (paths: { projectDir: string }) => Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-reactivacion-'));
  const fakeHome = path.join(tempRoot, 'home');
  const projectDir = path.join(fakeHome, '.claude', 'projects', '-workspace-demo-project');
  await mkdir(projectDir, { recursive: true });

  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  closeConnection();
  process.env.DATABASE_PATH = path.join(tempRoot, 'auth.db');
  await initializeDatabase();

  try {
    await runTest({ projectDir });
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** Escribe un transcript con el mtime dado: es la fecha de actividad que lee el synchronizer. */
async function escribirTranscript(
  projectDir: string,
  sessionId: string,
  entrypoint: string | null,
  mtime: Date,
): Promise<string> {
  const filePath = path.join(projectDir, `${sessionId}.jsonl`);
  const base = { sessionId, cwd: PROJECT_PATH, timestamp: mtime.toISOString() };
  const lines = [
    JSON.stringify({ ...base, type: 'user', ...(entrypoint ? { entrypoint } : {}), message: { role: 'user', content: 'hola' } }),
    JSON.stringify({ ...base, type: 'assistant', message: { role: 'assistant', content: [] } }),
  ];
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
  await utimes(filePath, mtime, mtime);
  return filePath;
}

/** Deja la sesión y su proyecto archivados por la limpieza el 1-oct, con fecha fija. */
function archivarSesionYProyecto(sessionId: string): void {
  sessionsDb.updateSessionIsArchived(sessionId, true, 'auto');
  projectsDb.updateProjectIsArchived(PROJECT_PATH, true, 'auto');
  const db = getConnection();
  db.prepare('UPDATE sessions SET archived_at = ? WHERE session_id = ?').run(ARCHIVADO, sessionId);
  db.prepare('UPDATE projects SET archived_at = ? WHERE project_path = ?').run(ARCHIVADO, PROJECT_PATH);
}

test('actividad posterior al archivado desarchiva la sesión y el proyecto', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    const synchronizer = new ClaudeSessionSynchronizer();
    const filePath = await escribirTranscript(projectDir, 'sess-viva', 'cli', ANTES);
    await synchronizer.synchronizeFile(filePath);
    archivarSesionYProyecto('sess-viva');

    // La sesión sigue escribiendo después del archivado.
    await utimes(filePath, DESPUES, DESPUES);
    await synchronizer.synchronizeFile(filePath);

    const row = sessionsDb.getSessionById('sess-viva');
    assert.equal(row?.isArchived, 0);
    assert.equal(row?.archived_at ?? null, null);
    assert.equal(row?.archived_by ?? null, null);
    const proyecto = projectsDb.getProjectPath(PROJECT_PATH);
    assert.equal(proyecto?.isArchived, 0);
    assert.equal(proyecto?.archived_at ?? null, null);
    assert.equal(proyecto?.archived_by ?? null, null);
  });
});

test('un .jsonl viejo re-escaneado no reactiva nada', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    const synchronizer = new ClaudeSessionSynchronizer();
    const filePath = await escribirTranscript(projectDir, 'sess-vieja', 'cli', ANTES);
    await synchronizer.synchronizeFile(filePath);
    archivarSesionYProyecto('sess-vieja');

    // Ni el archivo cambió ni hubo actividad: solo un re-escaneo.
    await synchronizer.synchronizeFile(filePath);
    await synchronizer.synchronize();

    assert.equal(sessionsDb.getSessionById('sess-vieja')?.isArchived, 1);
    assert.equal(sessionsDb.getSessionById('sess-vieja')?.archived_by, 'auto');
    assert.equal(projectsDb.getProjectPath(PROJECT_PATH)?.isArchived, 1);
  });
});

test('una sesión sdk-cli (headless) nueva no reactiva el proyecto archivado', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    projectsDb.createProjectPath(PROJECT_PATH);
    projectsDb.updateProjectIsArchived(PROJECT_PATH, true, 'auto');
    getConnection().prepare('UPDATE projects SET archived_at = ? WHERE project_path = ?').run(ARCHIVADO, PROJECT_PATH);

    const filePath = await escribirTranscript(projectDir, 'sess-headless', 'sdk-cli', DESPUES);
    await new ClaudeSessionSynchronizer().synchronizeFile(filePath);

    assert.equal(sessionsDb.getSessionById('sess-headless')?.entrypoint, 'sdk-cli');
    assert.equal(projectsDb.getProjectPath(PROJECT_PATH)?.isArchived, 1);
  });
});

test('una sesión interactiva nueva (entrypoint NULL) reactiva el proyecto archivado', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    projectsDb.createProjectPath(PROJECT_PATH);
    projectsDb.updateProjectIsArchived(PROJECT_PATH, true, 'auto');
    getConnection().prepare('UPDATE projects SET archived_at = ? WHERE project_path = ?').run(ARCHIVADO, PROJECT_PATH);

    const filePath = await escribirTranscript(projectDir, 'sess-nueva', null, DESPUES);
    await new ClaudeSessionSynchronizer().synchronizeFile(filePath);

    assert.equal(projectsDb.getProjectPath(PROJECT_PATH)?.isArchived, 0);
  });
});

test('un proyecto archivado sin archived_at (anterior a la columna) no se reactiva', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    projectsDb.createProjectPath(PROJECT_PATH);
    projectsDb.updateProjectIsArchived(PROJECT_PATH, true, 'auto');
    getConnection().prepare('UPDATE projects SET archived_at = NULL WHERE project_path = ?').run(PROJECT_PATH);

    const filePath = await escribirTranscript(projectDir, 'sess-sin-fecha', 'cli', DESPUES);
    await new ClaudeSessionSynchronizer().synchronizeFile(filePath);

    assert.equal(projectsDb.getProjectPath(PROJECT_PATH)?.isArchived, 1);
  });
});
