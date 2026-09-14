import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WORKSPACES_ROOT, expandWorkspaceHomePath, validateWorkspacePath } from '@/shared/utils.js';

/*
 * A `~` used to reach `path.resolve` as a relative segment: the server does not
 * run from the user's home, so `~/proyecto` resolved under the process cwd, and
 * `mkdir -p` then created an actual directory named `~` next to the app. The
 * path stayed inside the workspace root, so every containment check passed and
 * the empty folder got registered as a project.
 */

test('a leading ~ expands to the workspace root', () => {
  assert.equal(expandWorkspaceHomePath('~'), WORKSPACES_ROOT);
  assert.equal(
    expandWorkspaceHomePath('~/proyectos/app'),
    path.join(WORKSPACES_ROOT, 'proyectos/app'),
  );
});

test('a path without ~ is left alone', () => {
  assert.equal(expandWorkspaceHomePath('  /tmp/proyecto  '), '/tmp/proyecto');
});

test('validation expands ~ instead of resolving it against the cwd', async () => {
  const result = await validateWorkspacePath('~/proyecto-inexistente');
  assert.equal(result.valid, true);
  assert.equal(result.resolvedPath?.includes(`${path.sep}~${path.sep}`), false);
  assert.equal(
    result.resolvedPath,
    path.join(await realpathOrSelf(WORKSPACES_ROOT), 'proyecto-inexistente'),
  );
});

test('a relative path is rejected rather than resolved against the cwd', async () => {
  const result = await validateWorkspacePath('proyecto-relativo');
  assert.equal(result.valid, false);
  assert.match(result.error ?? '', /absolute/);
});

async function realpathOrSelf(target: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  try {
    return await realpath(target);
  } catch {
    return target;
  }
}

test('the workspace root is the home directory unless configured', () => {
  assert.equal(WORKSPACES_ROOT, process.env.WORKSPACES_ROOT || os.homedir());
});
