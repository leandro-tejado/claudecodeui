import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, projectsDb } from '@/modules/database/index.js';
import {
  deleteOrArchiveProject,
  restoreArchivedProject,
} from '@/modules/projects/services/project-delete.service.js';

/**
 * Fase 2 de `05-octubre-limpieza-barra-viva.md`: archivar o restaurar un
 * proyecto a mano deja `archived_by = 'user'`; la limpieza automática usa
 * `'auto'` y no debe confundirse con esto.
 */

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'project-delete-'));

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('archivar un proyecto a mano escribe archived_by="user" y restaurarlo lo limpia', async () => {
  await withIsolatedDatabase(async () => {
    const created = projectsDb.createProjectPath('/workspace/manual');
    const projectId = created.project?.project_id as string;

    await deleteOrArchiveProject(projectId, false);
    const archived = projectsDb.getProjectById(projectId);
    assert.equal(archived?.isArchived, 1);
    assert.equal(archived?.archived_by, 'user');
    assert.ok(archived?.archived_at, 'archived_at queda con la fecha');

    restoreArchivedProject(projectId);
    const restored = projectsDb.getProjectById(projectId);
    assert.equal(restored?.isArchived, 0);
    assert.equal(restored?.archived_by, null);
    assert.equal(restored?.archived_at, null);
  });
});
