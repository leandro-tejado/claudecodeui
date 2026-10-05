import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import { closeConnection, getConnection } from '@/modules/database/connection.js';
import { initializeDatabase } from '@/modules/database/init-db.js';
import { projectsDb } from '@/modules/database/repositories/projects.db.js';
import { sessionsDb } from '@/modules/database/repositories/sessions.db.js';

/**
 * Fase 2 de `05-octubre-limpieza-barra-viva.md`: `archived_at`/`archived_by`
 * en projects y sessions, y `entrypoint` en sessions. La migración corre al
 * arrancar el servicio contra la DB viva, así que tiene que ser idempotente y
 * no perder ninguna fila de una DB anterior.
 */

async function withTempDatabasePath(
  runTest: (databasePath: string) => void | Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'archive-columns-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;

  try {
    await runTest(databasePath);
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

function columnNamesOf(table: string): string[] {
  const rows = getConnection().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

// Forma de las tablas antes de esta fase: ya con project_id como PK y la
// clave del provider, pero sin ninguna de las columnas nuevas.
function createPreviousSchemaDatabase(databasePath: string): void {
  const legacy = new Database(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      project_id TEXT PRIMARY KEY NOT NULL,
      project_path TEXT NOT NULL UNIQUE,
      custom_project_name TEXT DEFAULT NULL,
      isStarred BOOLEAN DEFAULT 0,
      isArchived BOOLEAN DEFAULT 0
    );
    CREATE TABLE sessions (
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'claude',
      provider_session_id TEXT,
      custom_name TEXT,
      custom_name_is_placeholder BOOLEAN DEFAULT 0,
      project_path TEXT,
      jsonl_path TEXT,
      model TEXT,
      effort TEXT,
      forked_from_session_id TEXT,
      isArchived BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id),
      FOREIGN KEY (project_path) REFERENCES projects(project_path)
      ON DELETE SET NULL ON UPDATE CASCADE
    );
    INSERT INTO projects (project_id, project_path, custom_project_name, isStarred, isArchived)
      VALUES ('p-active', '/workspace/active', 'Active', 1, 0),
             ('p-archived', '/workspace/archived', 'Archived', 0, 1);
    INSERT INTO sessions (session_id, provider, provider_session_id, custom_name, project_path, jsonl_path, isArchived)
      VALUES ('s-active', 'claude', 's-active', 'Sesion activa', '/workspace/active', '/tmp/a.jsonl', 0),
             ('s-archived', 'claude', 's-archived', 'Sesion archivada', '/workspace/archived', '/tmp/b.jsonl', 1);
  `);
  legacy.close();
}

test('una DB anterior migra las columnas nuevas sin perder filas, y volver a migrar no rompe nada', async () => {
  await withTempDatabasePath(async (databasePath) => {
    createPreviousSchemaDatabase(databasePath);

    await initializeDatabase();

    const projectColumns = columnNamesOf('projects');
    const sessionColumns = columnNamesOf('sessions');
    assert.ok(projectColumns.includes('archived_at'));
    assert.ok(projectColumns.includes('archived_by'));
    assert.ok(sessionColumns.includes('archived_at'));
    assert.ok(sessionColumns.includes('archived_by'));
    assert.ok(sessionColumns.includes('entrypoint'));

    const db = getConnection();
    const projects = db
      .prepare('SELECT project_id, custom_project_name, isStarred, isArchived, archived_at, archived_by FROM projects ORDER BY project_id')
      .all();
    assert.deepEqual(projects, [
      { project_id: 'p-active', custom_project_name: 'Active', isStarred: 1, isArchived: 0, archived_at: null, archived_by: null },
      { project_id: 'p-archived', custom_project_name: 'Archived', isStarred: 0, isArchived: 1, archived_at: null, archived_by: null },
    ]);

    const sessions = db
      .prepare('SELECT session_id, custom_name, jsonl_path, isArchived, archived_at, archived_by, entrypoint FROM sessions ORDER BY session_id')
      .all();
    assert.deepEqual(sessions, [
      { session_id: 's-active', custom_name: 'Sesion activa', jsonl_path: '/tmp/a.jsonl', isArchived: 0, archived_at: null, archived_by: null, entrypoint: null },
      { session_id: 's-archived', custom_name: 'Sesion archivada', jsonl_path: '/tmp/b.jsonl', isArchived: 1, archived_at: null, archived_by: null, entrypoint: null },
    ]);

    // Segundo arranque sobre la misma DB: idempotente, mismas filas y columnas.
    await initializeDatabase();
    assert.deepEqual(columnNamesOf('projects'), projectColumns);
    assert.deepEqual(columnNamesOf('sessions'), sessionColumns);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n, 2);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n, 2);
  });
});

test('una DB nueva ya nace con las columnas y migrar dos veces no las duplica', async () => {
  await withTempDatabasePath(async () => {
    await initializeDatabase();
    await initializeDatabase();

    const sessionColumns = columnNamesOf('sessions');
    for (const column of ['archived_at', 'archived_by', 'entrypoint']) {
      assert.equal(sessionColumns.filter((name) => name === column).length, 1, column);
    }
    const projectColumns = columnNamesOf('projects');
    for (const column of ['archived_at', 'archived_by']) {
      assert.equal(projectColumns.filter((name) => name === column).length, 1, column);
    }
  });
});

test('archivar escribe archived_at y archived_by, y restaurar los limpia', async () => {
  await withTempDatabasePath(async () => {
    await initializeDatabase();
    sessionsDb.createSession('s-1', 'claude', '/workspace/demo', 'Demo');

    sessionsDb.updateSessionIsArchived('s-1', true, 'auto');
    const archivedSession = sessionsDb.getSessionById('s-1');
    assert.equal(archivedSession?.isArchived, 1);
    assert.equal(archivedSession?.archived_by, 'auto');
    assert.ok(archivedSession?.archived_at, 'archived_at queda con la fecha');

    sessionsDb.updateSessionIsArchived('s-1', false, 'user');
    const restoredSession = sessionsDb.getSessionById('s-1');
    assert.equal(restoredSession?.isArchived, 0);
    assert.equal(restoredSession?.archived_by, null);
    assert.equal(restoredSession?.archived_at, null);

    projectsDb.updateProjectIsArchived('/workspace/demo', true, 'auto');
    const archivedProject = projectsDb.getProjectPath('/workspace/demo');
    assert.equal(archivedProject?.isArchived, 1);
    assert.equal(archivedProject?.archived_by, 'auto');
    assert.ok(archivedProject?.archived_at);

    // Reactivar el path por una acción del usuario también limpia el rastro.
    projectsDb.createProjectPath('/workspace/demo');
    const reactivated = projectsDb.getProjectPath('/workspace/demo');
    assert.equal(reactivated?.isArchived, 0);
    assert.equal(reactivated?.archived_by, null);
    assert.equal(reactivated?.archived_at, null);

    projectsDb.updateProjectIsArchived('/workspace/demo', true, 'user');
    projectsDb.updateProjectIsArchived('/workspace/demo', false, 'user');
    const restoredProject = projectsDb.getProjectPath('/workspace/demo');
    assert.equal(restoredProject?.archived_by, null);
    assert.equal(restoredProject?.archived_at, null);
  });
});

test('createSession guarda entrypoint solo si la columna estaba en NULL', async () => {
  await withTempDatabasePath(async () => {
    await initializeDatabase();

    sessionsDb.createSession('s-1', 'claude', '/workspace/demo', 'Demo');
    assert.equal(sessionsDb.getSessionById('s-1')?.entrypoint, null);

    sessionsDb.createSession('s-1', 'claude', '/workspace/demo', 'Demo', undefined, undefined, null, 'cli');
    assert.equal(sessionsDb.getSessionById('s-1')?.entrypoint, 'cli');

    // Un valor distinto en una pasada posterior no pisa el primero.
    sessionsDb.createSession('s-1', 'claude', '/workspace/demo', 'Demo', undefined, undefined, null, 'sdk-cli');
    assert.equal(sessionsDb.getSessionById('s-1')?.entrypoint, 'cli');

    // Nace con el valor cuando la fila no existía.
    sessionsDb.createSession('s-2', 'claude', '/workspace/demo', 'Dos', undefined, undefined, null, 'sdk-ts');
    assert.equal(sessionsDb.getSessionById('s-2')?.entrypoint, 'sdk-ts');
  });
});
