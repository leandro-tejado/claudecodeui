import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import {
  _resetRegistroSesionesCacheParaTests,
  getProjectsWithSessions,
} from '@/modules/projects/services/projects-with-sessions-fetch.service.js';
import { nombreTmux } from '@/modules/websocket/index.js';

/*
 * El campo `tmux` de cada sesión (plan `16-septiembre-os-orquestador-y-recursos.md`,
 * Fase 2): sale de `~/.cache/aos/sesiones.json`, con `AOS_SESIONES_REGISTRO_PATH`
 * como override para no tocar el registro real en los tests.
 */

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

async function withRegistro(
  registro: Record<string, unknown> | null,
  runTest: () => Promise<void>,
): Promise<void> {
  const previousPath = process.env.AOS_SESIONES_REGISTRO_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'projects-with-sessions-fetch-registro-'));
  const registroPath = path.join(tempDirectory, 'sesiones.json');

  if (registro !== null) {
    await writeFile(registroPath, JSON.stringify(registro));
  }
  process.env.AOS_SESIONES_REGISTRO_PATH = registroPath;
  _resetRegistroSesionesCacheParaTests();

  try {
    await runTest();
  } finally {
    if (previousPath === undefined) {
      delete process.env.AOS_SESIONES_REGISTRO_PATH;
    } else {
      process.env.AOS_SESIONES_REGISTRO_PATH = previousPath;
    }
    _resetRegistroSesionesCacheParaTests();
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('a session matched by session_id in the registry reports tmux vivo', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-a', 'claude', projectDirectory, 'Session A');

      await withRegistro(
        {
          'cloudcli-alguna-cosa': {
            nombre: 'cloudcli-alguna-cosa',
            session_id: 'session-tmux-a',
            estado: 'viva',
          },
        },
        async () => {
          const projects = await getProjectsWithSessions({ skipSynchronization: true });
          const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-a');

          assert.ok(session, 'expected session-tmux-a to be present');
          assert.deepEqual((session as { tmux: unknown }).tmux, {
            nombre: 'cloudcli-alguna-cosa',
            vivo: true,
          });
        },
      );
    });
  });
});

test('a session matched only by the nombreTmux() fallback name reports tmux vivo', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-b', 'claude', projectDirectory, 'Session B');
      const nombreEsperado = nombreTmux(projectDirectory, 'session-tmux-b');

      await withRegistro(
        {
          [nombreEsperado]: {
            nombre: nombreEsperado,
            session_id: null,
            estado: 'viva',
          },
        },
        async () => {
          const projects = await getProjectsWithSessions({ skipSynchronization: true });
          const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-b');

          assert.ok(session, 'expected session-tmux-b to be present');
          assert.deepEqual((session as { tmux: unknown }).tmux, {
            nombre: nombreEsperado,
            vivo: true,
          });
        },
      );
    });
  });
});

test('a session with no match in the registry reports tmux null', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-c', 'claude', projectDirectory, 'Session C');

      await withRegistro(
        {
          'cloudcli-otra-sesion': {
            nombre: 'cloudcli-otra-sesion',
            session_id: 'session-que-no-es',
            estado: 'viva',
          },
        },
        async () => {
          const projects = await getProjectsWithSessions({ skipSynchronization: true });
          const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-c');

          assert.ok(session, 'expected session-tmux-c to be present');
          assert.equal((session as { tmux: unknown }).tmux, null);
        },
      );
    });
  });
});

test('an absent registry file reports tmux null without throwing', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-d', 'claude', projectDirectory, 'Session D');

      await withRegistro(null, async () => {
        const projects = await getProjectsWithSessions({ skipSynchronization: true });
        const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-d');

        assert.ok(session, 'expected session-tmux-d to be present');
        assert.equal((session as { tmux: unknown }).tmux, null);
      });
    });
  });
});

test('a session matched to the fixed orchestrator entry (fija: true) reports it', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-f', 'claude', projectDirectory, 'Session F');

      await withRegistro(
        {
          orquestador: {
            nombre: 'orquestador',
            session_id: 'session-tmux-f',
            estado: 'viva',
            fija: true,
          },
        },
        async () => {
          const projects = await getProjectsWithSessions({ skipSynchronization: true });
          const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-f');

          assert.ok(session, 'expected session-tmux-f to be present');
          assert.deepEqual((session as { tmux: unknown }).tmux, {
            nombre: 'orquestador',
            vivo: true,
            fija: true,
          });
        },
      );
    });
  });
});

test('a non-fixed entry never carries the fija key (exact shape, not just falsy)', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-g', 'claude', projectDirectory, 'Session G');

      await withRegistro(
        {
          'cloudcli-normal': {
            nombre: 'cloudcli-normal',
            session_id: 'session-tmux-g',
            estado: 'viva',
          },
        },
        async () => {
          const projects = await getProjectsWithSessions({ skipSynchronization: true });
          const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-g');

          assert.ok(session, 'expected session-tmux-g to be present');
          assert.deepEqual((session as { tmux: unknown }).tmux, {
            nombre: 'cloudcli-normal',
            vivo: true,
          });
        },
      );
    });
  });
});

test('a stale entry pointing at a dead tmux session (estado caida) reports vivo false', async () => {
  await withTempProjectDirectory(async (projectDirectory) => {
    await withIsolatedDatabase(async () => {
      sessionsDb.createSession('session-tmux-e', 'claude', projectDirectory, 'Session E');

      await withRegistro(
        {
          'cloudcli-caida': {
            nombre: 'cloudcli-caida',
            session_id: 'session-tmux-e',
            estado: 'caida',
          },
        },
        async () => {
          const projects = await getProjectsWithSessions({ skipSynchronization: true });
          const session = projects[0]?.sessions.find((candidate) => candidate.id === 'session-tmux-e');

          assert.ok(session, 'expected session-tmux-e to be present');
          assert.deepEqual((session as { tmux: unknown }).tmux, {
            nombre: 'cloudcli-caida',
            vivo: false,
          });
        },
      );
    });
  });
});
