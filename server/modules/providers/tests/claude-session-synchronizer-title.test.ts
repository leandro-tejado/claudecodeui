import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { ClaudeSessionSynchronizer } from '@/modules/providers/list/claude/claude-session-synchronizer.provider.js';

/**
 * Reproduction + regression coverage for Fase 5 of
 * `17-septiembre-ux-sesiones-y-cuota.md`: a CloudCLI-created chat that opens
 * with a literal command (e.g. `/algo`) keeps that literal text as its
 * sidebar title forever, even after the SDK writes its own `ai-title` for
 * the conversation into the transcript.
 *
 * Root cause was two redundant "never touch an app-set name" guards:
 *   - `ClaudeSessionSynchronizer.processSessionFile` returned the existing
 *     `custom_name` unchanged whenever it was non-null/non-"Untitled",
 *     without even looking at the transcript's `ai-title` row.
 *   - `sessionsDb.createSession`'s upsert independently refused to touch
 *     `custom_name` for any app-created row that already had one.
 * Both are gone now; `custom_name_is_placeholder` distinguishes "app's
 * literal-first-words guess, upgradable once" from "locked" (a synchronizer
 * already upgraded it, or the user renamed it).
 */

const PROJECT_PATH = '/workspace/demo-project';
const SESSION_ID = 'provider-session-title-test';

function encodeClaudeProjectDir(projectPath: string): string {
  // Mirrors how Claude Code encodes a cwd into the `~/.claude/projects/`
  // directory name closely enough for this test: any non-alnum run becomes
  // one dash. The exact scheme doesn't matter here — the synchronizer only
  // cares about the file's own `cwd` field, not the directory name.
  return projectPath.replace(/[^a-zA-Z0-9]+/g, '-');
}

async function withIsolatedEnvironment(
  runTest: (paths: { claudeHome: string; transcriptPath: string }) => Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-title-sync-'));
  const fakeHome = path.join(tempRoot, 'home');
  const projectDir = path.join(fakeHome, '.claude', 'projects', encodeClaudeProjectDir(PROJECT_PATH));
  await mkdir(projectDir, { recursive: true });
  const transcriptPath = path.join(projectDir, `${SESSION_ID}.jsonl`);

  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  closeConnection();
  process.env.DATABASE_PATH = path.join(tempRoot, 'auth.db');
  await initializeDatabase();

  try {
    await runTest({ claudeHome: path.join(fakeHome, '.claude'), transcriptPath });
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

function userLine(text: string, timestamp: string) {
  return JSON.stringify({
    type: 'user',
    sessionId: SESSION_ID,
    cwd: PROJECT_PATH,
    timestamp,
    message: { role: 'user', content: text },
  });
}

function assistantLine(timestamp: string) {
  return JSON.stringify({
    type: 'assistant',
    sessionId: SESSION_ID,
    cwd: PROJECT_PATH,
    timestamp,
    message: { role: 'assistant', content: [{ type: 'text', text: 'On it.' }], stop_reason: 'end_turn' },
  });
}

// The six bookkeeping rows Claude Code appends after every assistant turn
// (verified 16-sep on this VPS against a live v2.1.273 transcript — see
// tmux-bridge.service.ts). Only `ai-title` matters for this test; the rest
// are here so the fixture matches a real transcript's shape.
function bookkeepingRows(aiTitle: string, timestamp: string): string[] {
  return [
    JSON.stringify({ type: 'system', sessionId: SESSION_ID, timestamp }),
    JSON.stringify({ type: 'last-prompt', sessionId: SESSION_ID, lastPrompt: '/algo', timestamp }),
    JSON.stringify({ type: 'ai-title', sessionId: SESSION_ID, aiTitle, timestamp }),
    JSON.stringify({ type: 'mode', sessionId: SESSION_ID, timestamp }),
    JSON.stringify({ type: 'permission-mode', sessionId: SESSION_ID, timestamp }),
    JSON.stringify({ type: 'atis-latch', sessionId: SESSION_ID, timestamp }),
  ];
}

test('a literal-command chat title updates once the SDK writes its ai-title for the turn', async () => {
  await withIsolatedEnvironment(async ({ transcriptPath }) => {
    // 1) The user starts a brand-new chat with a literal command. This is
    // exactly what `sessionsService.createAppSession` does via
    // `buildCloudCliSessionName`: the row is born with the literal text as
    // its placeholder name.
    sessionsDb.createAppSession('app-session-1', 'claude', PROJECT_PATH, '/algo');
    sessionsDb.assignProviderSessionId('app-session-1', SESSION_ID);

    const beforeRow = sessionsDb.getSessionById('app-session-1');
    assert.equal(beforeRow?.custom_name, '/algo');
    assert.equal(beforeRow?.custom_name_is_placeholder, 1);

    // 2) Only the user's opening message is on disk so far (the run hasn't
    // produced a response yet). Syncing now must not blank/downgrade the
    // placeholder even though nothing better is available.
    await writeFile(transcriptPath, `${userLine('/algo', '2026-09-17T10:00:00.000Z')}\n`, 'utf8');
    const synchronizer = new ClaudeSessionSynchronizer();
    await synchronizer.synchronizeFile(transcriptPath);

    const midRow = sessionsDb.getSessionById('app-session-1');
    assert.equal(midRow?.custom_name, '/algo');
    assert.equal(midRow?.custom_name_is_placeholder, 1);

    // 3) The first turn completes and the SDK appends its own bookkeeping
    // rows, including a real `ai-title`. THIS is the reproduction: before
    // the fix, the guard in `processSessionFile` returned the existing name
    // unchanged without even reading these rows, so the chat stayed titled
    // "/algo" forever.
    const lines = [
      userLine('/algo', '2026-09-17T10:00:00.000Z'),
      assistantLine('2026-09-17T10:00:05.000Z'),
      ...bookkeepingRows('Reviewing the deployment script', '2026-09-17T10:00:05.500Z'),
    ];
    await writeFile(transcriptPath, `${lines.join('\n')}\n`, 'utf8');
    await synchronizer.synchronizeFile(transcriptPath);

    const afterRow = sessionsDb.getSessionById('app-session-1');
    assert.equal(afterRow?.custom_name, 'Reviewing the deployment script');
    assert.equal(afterRow?.custom_name_is_placeholder, 0);

    // 4) A second turn's `ai-title` (or its `last-prompt` fallback) must not
    // rename the chat again — the upgrade is a one-time thing, matching the
    // plan's "no renombrar agresivamente cada turno".
    const secondTurnLines = [
      ...lines,
      userLine('keep going', '2026-09-17T10:01:00.000Z'),
      assistantLine('2026-09-17T10:01:05.000Z'),
      ...bookkeepingRows('A completely different title', '2026-09-17T10:01:05.500Z'),
    ];
    await writeFile(transcriptPath, `${secondTurnLines.join('\n')}\n`, 'utf8');
    await synchronizer.synchronizeFile(transcriptPath);

    const finalRow = sessionsDb.getSessionById('app-session-1');
    assert.equal(finalRow?.custom_name, 'Reviewing the deployment script');
  });
});
