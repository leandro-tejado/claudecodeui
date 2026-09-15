import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { getProjectsWithSessions } from '@/modules/projects/services/projects-with-sessions-fetch.service.js';

async function withIsolatedDatabase(runTest: () => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'projects-with-sessions-fetch-db-'));
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

async function withTempProjectDirectory(runTest: (projectDirectory: string) => Promise<void>): Promise<void> {
  const projectDirectory = await mkdtemp(path.join(tmpdir(), 'projects-with-sessions-fetch-project-'));
  try {
    await runTest(projectDirectory);
  } finally {
    await rm(projectDirectory, { recursive: true, force: true });
  }
}

function metaJson(agentType: string, description: string, toolUseId: string): string {
  return JSON.stringify({ agentType, description, toolUseId, spawnDepth: 1 });
}

test('a session with 3 agent-*.meta.json files reports subagentCount 3', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      const jsonlPath = path.join(projectDirectory, 'session-a.jsonl');
      const subagentsDirectory = path.join(projectDirectory, 'session-a', 'subagents');
      await mkdir(subagentsDirectory, { recursive: true });
      await writeFile(path.join(subagentsDirectory, 'agent-a1.meta.json'), metaJson('general-purpose', 'first', 'toolu_1'));
      await writeFile(path.join(subagentsDirectory, 'agent-a2.meta.json'), metaJson('dev', 'second', 'toolu_2'));
      await writeFile(path.join(subagentsDirectory, 'agent-a3.meta.json'), metaJson('marketing', 'third', 'toolu_3'));
      // A stray transcript file with no matching `.meta.json` must not be
      // counted as a fourth subagent.
      await writeFile(path.join(subagentsDirectory, 'agent-a1.jsonl'), '');

      sessionsDb.createSession('session-a', 'claude', projectDirectory, 'Session A', undefined, undefined, jsonlPath);

      const projects = await getProjectsWithSessions({ skipSynchronization: true });
      const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-a');

      assert.ok(session, 'expected session-a to be present in the response');
      assert.equal((session as { subagentCount: number }).subagentCount, 3);
      assert.equal((session as { subagents: unknown[] }).subagents.length, 3);
    });
  });
});

test('a session with no subagents/ directory reports subagentCount 0 without throwing', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      const jsonlPath = path.join(projectDirectory, 'session-b.jsonl');

      sessionsDb.createSession('session-b', 'claude', projectDirectory, 'Session B', undefined, undefined, jsonlPath);

      const projects = await getProjectsWithSessions({ skipSynchronization: true });
      const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-b');

      assert.ok(session, 'expected session-b to be present in the response');
      assert.equal((session as { subagentCount: number }).subagentCount, 0);
      assert.deepEqual((session as { subagents: unknown[] }).subagents, []);
    });
  });
});

test('a session with jsonl_path null (app-created, never written) reports subagentCount 0', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-c', 'claude', projectDirectory, 'Session C');

      const projects = await getProjectsWithSessions({ skipSynchronization: true });
      const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-c');

      assert.ok(session, 'expected session-c to be present in the response');
      assert.equal((session as { subagentCount: number }).subagentCount, 0);
    });
  });
});

test('a subagent summary carries type, description and a best-effort model/status from its transcript tail', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      const jsonlPath = path.join(projectDirectory, 'session-d.jsonl');
      const subagentsDirectory = path.join(projectDirectory, 'session-d', 'subagents');
      await mkdir(subagentsDirectory, { recursive: true });
      await writeFile(
        path.join(subagentsDirectory, 'agent-d1.meta.json'),
        metaJson('dev', 'read the config', 'toolu_d1'),
      );
      const transcriptLines = [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'go' } }),
        JSON.stringify({
          type: 'assistant',
          message: { model: 'claude-sonnet-5', content: [{ type: 'text', text: 'done' }] },
        }),
      ];
      await writeFile(path.join(subagentsDirectory, 'agent-d1.jsonl'), `${transcriptLines.join('\n')}\n`);

      sessionsDb.createSession('session-d', 'claude', projectDirectory, 'Session D', undefined, undefined, jsonlPath);
      const projects = await getProjectsWithSessions({ skipSynchronization: true });
      const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-d');
      const subagent = (session as { subagents: Array<{ id: string; type: string; description: string; model: string | null; status: string }> })
        .subagents[0];

      assert.equal(subagent.id, 'toolu_d1');
      assert.equal(subagent.type, 'dev');
      assert.equal(subagent.description, 'read the config');
      assert.equal(subagent.model, 'claude-sonnet-5');
      assert.equal(subagent.status, 'completed');
    });
  });
});
