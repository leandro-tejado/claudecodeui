import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection } from '@/modules/database/connection.js';
import { initializeDatabase } from '@/modules/database/init-db.js';
import { sessionsDb } from '@/modules/database/repositories/sessions.db.js';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'sessions-mapping-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
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

test('disk-discovered sessions are keyed by the provider id for both columns', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createSession('provider-abc', 'claude', '/workspace/demo', 'From Disk');

    const row = sessionsDb.getSessionById('provider-abc');
    assert.equal(row?.session_id, 'provider-abc');
    assert.equal(row?.provider_session_id, 'provider-abc');

    const byProviderId = sessionsDb.getSessionByProviderSessionId('provider-abc');
    assert.equal(byProviderId?.session_id, 'provider-abc');
  });
});

test('app sessions get the provider id assigned without creating a duplicate row', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-id-1', 'claude', '/workspace/demo', 'Initial CloudCLI message');
    sessionsDb.assignProviderSessionId('app-id-1', 'provider-xyz');

    // A later synchronizer pass that discovers the transcript on disk must
    // update the app row in place instead of inserting a provider-keyed row.
    const returnedId = sessionsDb.createSession(
      'provider-xyz',
      'claude',
      '/workspace/demo',
      'Synced Name',
      undefined,
      undefined,
      '/fake/path/provider-xyz.jsonl',
    );

    assert.equal(returnedId, 'app-id-1');
    assert.equal(sessionsDb.getAllSessions().length, 1);

    const row = sessionsDb.getSessionById('app-id-1');
    assert.equal(row?.provider_session_id, 'provider-xyz');
    assert.equal(row?.jsonl_path, '/fake/path/provider-xyz.jsonl');
    // `custom_name` starts as a placeholder (the literal first message), so
    // the synchronizer's first real title upgrades it — this is the Fase 5
    // fix (17-septiembre-ux-sesiones-y-cuota.md): before it, this name was
    // stuck on the literal first message forever.
    assert.equal(row?.custom_name, 'Synced Name');
    assert.equal(row?.custom_name_is_placeholder, 0);
  });
});

test('a locked session name (already synced once, or renamed by the user) is never overwritten by a later sync', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-id-locked', 'claude', '/workspace/demo', 'Initial CloudCLI message');
    sessionsDb.assignProviderSessionId('app-id-locked', 'provider-locked');

    // First sync upgrades the placeholder and locks it (same as the test above).
    sessionsDb.createSession(
      'provider-locked',
      'claude',
      '/workspace/demo',
      'First Real Title',
      undefined,
      undefined,
      '/fake/path/provider-locked.jsonl',
    );
    assert.equal(sessionsDb.getSessionById('app-id-locked')?.custom_name, 'First Real Title');

    // A later sync pass (e.g. the SDK's `last-prompt` fallback on the next
    // turn) must not touch it again — only one upgrade, ever.
    sessionsDb.createSession(
      'provider-locked',
      'claude',
      '/workspace/demo',
      'Second Turn Prompt',
      undefined,
      undefined,
      '/fake/path/provider-locked.jsonl',
    );

    const row = sessionsDb.getSessionById('app-id-locked');
    assert.equal(row?.custom_name, 'First Real Title');
    assert.equal(row?.custom_name_is_placeholder, 0);
  });
});

test('an explicit user rename locks the name against any later sync', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-id-renamed', 'claude', '/workspace/demo', 'Initial CloudCLI message');
    sessionsDb.assignProviderSessionId('app-id-renamed', 'provider-renamed');

    sessionsDb.updateSessionCustomName('app-id-renamed', 'User Chosen Name');
    assert.equal(sessionsDb.getSessionById('app-id-renamed')?.custom_name_is_placeholder, 0);

    sessionsDb.createSession(
      'provider-renamed',
      'claude',
      '/workspace/demo',
      'Synced Name',
      undefined,
      undefined,
      '/fake/path/provider-renamed.jsonl',
    );

    const row = sessionsDb.getSessionById('app-id-renamed');
    assert.equal(row?.custom_name, 'User Chosen Name');
  });
});

test('assignProviderSessionId merges a watcher-created duplicate into the app row', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-id-2', 'codex', '/workspace/demo');

    // Simulate the race: the filesystem watcher indexed the provider
    // transcript before the runtime announced its session id to the gateway.
    sessionsDb.createSession(
      'provider-race',
      'codex',
      '/workspace/demo',
      'Watcher Name',
      undefined,
      undefined,
      '/fake/provider-race.jsonl',
    );
    assert.equal(sessionsDb.getAllSessions().length, 2);

    sessionsDb.assignProviderSessionId('app-id-2', 'provider-race');

    const rows = sessionsDb.getAllSessions();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.session_id, 'app-id-2');
    assert.equal(rows[0]?.provider_session_id, 'provider-race');
    // Transcript path and name from the duplicate are adopted.
    assert.equal(rows[0]?.jsonl_path, '/fake/provider-race.jsonl');
    assert.equal(rows[0]?.custom_name, 'Watcher Name');
  });
});

test('legacy provider-keyed rows stay resolvable through both lookups', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createSession('legacy-1', 'opencode', '/workspace/demo');

    assert.equal(sessionsDb.getSessionById('legacy-1')?.provider, 'opencode');
    assert.equal(sessionsDb.getSessionByProviderSessionId('legacy-1')?.session_id, 'legacy-1');
  });
});
