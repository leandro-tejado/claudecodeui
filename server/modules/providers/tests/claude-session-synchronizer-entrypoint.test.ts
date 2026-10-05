import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { ClaudeSessionSynchronizer } from '@/modules/providers/list/claude/claude-session-synchronizer.provider.js';

/**
 * Fase 2 de `05-octubre-limpieza-barra-viva.md`: el synchronizer lee
 * `entrypoint` de las primeras líneas del .jsonl ('cli' en tmux/ct,
 * 'sdk-cli' en `claude -p`, 'sdk-ts' en el chat de CloudCLI) y lo guarda solo
 * si la columna está en NULL.
 */

const PROJECT_PATH = '/workspace/demo-project';

async function withIsolatedEnvironment(
  runTest: (paths: { projectDir: string }) => Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-entrypoint-sync-'));
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

// Las filas del arranque de un transcript real: algunas no traen sessionId ni
// entrypoint (snapshots, cola), y el entrypoint aparece en la primera línea de
// usuario.
function transcript(sessionId: string, entrypoint: string | null): string {
  const base = { sessionId, cwd: PROJECT_PATH, timestamp: '2026-10-05T10:00:00.000Z' };
  const lines = [
    JSON.stringify({ type: 'file-history-snapshot', messageId: 'm-0', snapshot: {} }),
    JSON.stringify({ type: 'queue-operation', operation: 'enqueue', sessionId }),
    JSON.stringify({
      ...base,
      type: 'user',
      ...(entrypoint ? { entrypoint } : {}),
      message: { role: 'user', content: 'hola' },
    }),
    JSON.stringify({ ...base, type: 'assistant', message: { role: 'assistant', content: [] } }),
  ];
  return `${lines.join('\n')}\n`;
}

test('el entrypoint sale del .jsonl: "cli" de tmux y "sdk-cli" de claude -p', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    const cliPath = path.join(projectDir, 'sess-cli.jsonl');
    const headlessPath = path.join(projectDir, 'sess-headless.jsonl');
    await writeFile(cliPath, transcript('sess-cli', 'cli'), 'utf8');
    await writeFile(headlessPath, transcript('sess-headless', 'sdk-cli'), 'utf8');

    const synchronizer = new ClaudeSessionSynchronizer();
    await synchronizer.synchronizeFile(cliPath);
    await synchronizer.synchronizeFile(headlessPath);

    assert.equal(sessionsDb.getSessionById('sess-cli')?.entrypoint, 'cli');
    assert.equal(sessionsDb.getSessionById('sess-headless')?.entrypoint, 'sdk-cli');
  });
});

test('la sincronización completa llena el entrypoint de las filas que ya existían', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    const filePath = path.join(projectDir, 'sess-old.jsonl');
    await writeFile(filePath, transcript('sess-old', 'sdk-ts'), 'utf8');

    // La fila ya existe de antes de la columna: sin entrypoint.
    sessionsDb.createSession('sess-old', 'claude', PROJECT_PATH, 'Vieja', undefined, undefined, filePath);
    assert.equal(sessionsDb.getSessionById('sess-old')?.entrypoint, null);

    await new ClaudeSessionSynchronizer().synchronize();

    assert.equal(sessionsDb.getSessionById('sess-old')?.entrypoint, 'sdk-ts');
  });
});

test('un valor ya guardado no se pisa, y sin entrypoint en el .jsonl queda en NULL', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    const filePath = path.join(projectDir, 'sess-keep.jsonl');
    await writeFile(filePath, transcript('sess-keep', 'cli'), 'utf8');
    const synchronizer = new ClaudeSessionSynchronizer();
    await synchronizer.synchronizeFile(filePath);

    // El transcript cambia de valor (no debería pasar): la primera lectura manda.
    await writeFile(filePath, transcript('sess-keep', 'sdk-cli'), 'utf8');
    await synchronizer.synchronizeFile(filePath);
    assert.equal(sessionsDb.getSessionById('sess-keep')?.entrypoint, 'cli');

    const bareName = path.join(projectDir, 'sess-bare.jsonl');
    await writeFile(bareName, transcript('sess-bare', null), 'utf8');
    await synchronizer.synchronizeFile(bareName);
    assert.equal(sessionsDb.getSessionById('sess-bare')?.entrypoint, null);
  });
});

test('el entrypoint que aparece pasadas las primeras 10 líneas no se busca', async () => {
  await withIsolatedEnvironment(async ({ projectDir }) => {
    const filePath = path.join(projectDir, 'sess-late.jsonl');
    const base = { sessionId: 'sess-late', cwd: PROJECT_PATH };
    const lines = [
      JSON.stringify({ ...base, type: 'user', message: { role: 'user', content: 'hola' } }),
      ...Array.from({ length: 12 }, (_, index) => JSON.stringify({ ...base, type: 'system', index })),
      JSON.stringify({ ...base, type: 'user', entrypoint: 'cli', message: { role: 'user', content: 'otra' } }),
    ];
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

    await new ClaudeSessionSynchronizer().synchronizeFile(filePath);

    assert.equal(sessionsDb.getSessionById('sess-late')?.entrypoint, null);
  });
});
