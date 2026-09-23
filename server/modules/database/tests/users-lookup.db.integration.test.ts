import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  closeConnection,
  getConnection,
  initializeDatabase,
  userDb,
} from '@/modules/database/index.js';

async function withDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'users-lookup-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await writeFile(databasePath, '');
  await initializeDatabase();

  getConnection()
    .prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
    .run(1, 'leandrotejado', 'hash');

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

// iOS Safari capitalises the first letter of a text input unless the field
// opts out, so the phone sends "Leandrotejado" for an account stored as
// "leandrotejado". A case-sensitive lookup turns that into
// AUTH_INVALID_CREDENTIALS, which reads as a wrong password and is not one.
test('a username matches whatever case it was typed in', async () => {
  await withDatabase(() => {
    for (const typed of ['leandrotejado', 'Leandrotejado', 'LEANDROTEJADO', 'LeAnDroTejado']) {
      assert.equal(userDb.getUserByUsername(typed)?.username, 'leandrotejado', `typed as ${typed}`);
    }
  });
});

test('a username that does not exist still misses', async () => {
  await withDatabase(() => {
    assert.equal(userDb.getUserByUsername('otro'), undefined);
  });
});

test('an inactive user never matches, whatever the case', async () => {
  await withDatabase(() => {
    getConnection().prepare('UPDATE users SET is_active = 0 WHERE id = 1').run();
    assert.equal(userDb.getUserByUsername('Leandrotejado'), undefined);
  });
});
