import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import {
  _resetRegistroSesionesCacheParaTests,
  _setListarPanesTmuxParaTests,
  getProjectsWithSessions,
  listarPanesTmux,
  sesionesConVivoCambiado,
  vivoEfectivoPorSesion,
} from '@/modules/projects/services/projects-with-sessions-fetch.service.js';

/*
 * Bug del 07-oct: el `tmux.vivo` de cada sesión salía solo del registro
 * (`~/.cache/aos/sesiones.json`), que `orquestar.py dormir` no reescribe y
 * `aos-ciclo` refresca cada 10 min. Un pane muerto seguía "vivo" en la barra,
 * y uno que cambiaba no avisaba a nadie. Ahora se cruza con `tmux
 * list-sessions`, y lo que cambia sale como `session_upserted`.
 */

async function conEscenario(
  registro: Record<string, unknown>,
  panes: Set<string> | null,
  runTest: (projectDirectory: string) => Promise<void>,
): Promise<void> {
  const previousDb = process.env.DATABASE_PATH;
  const previousRegistro = process.env.AOS_SESIONES_REGISTRO_PATH;
  const dir = await mkdtemp(path.join(tmpdir(), 'panes-vivos-'));
  const projectDirectory = path.join(dir, 'proyecto');
  await writeFile(path.join(dir, 'sesiones.json'), JSON.stringify(registro));
  await import('node:fs/promises').then((fs) => fs.mkdir(projectDirectory));

  closeConnection();
  process.env.DATABASE_PATH = path.join(dir, 'auth.db');
  process.env.AOS_SESIONES_REGISTRO_PATH = path.join(dir, 'sesiones.json');
  await initializeDatabase();
  _setListarPanesTmuxParaTests(async () => panes);
  _resetRegistroSesionesCacheParaTests();

  try {
    await runTest(projectDirectory);
  } finally {
    _setListarPanesTmuxParaTests(null);
    _resetRegistroSesionesCacheParaTests();
    closeConnection();
    if (previousDb === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDb;
    if (previousRegistro === undefined) delete process.env.AOS_SESIONES_REGISTRO_PATH;
    else process.env.AOS_SESIONES_REGISTRO_PATH = previousRegistro;
    await rm(dir, { recursive: true, force: true });
  }
}

async function tmuxDeSesion(sessionId: string): Promise<unknown> {
  const projects = await getProjectsWithSessions({ skipSynchronization: true });
  const session = projects[0]?.sessions.find((candidate) => candidate.id === sessionId);
  assert.ok(session, `falta ${sessionId}`);
  return (session as { tmux: unknown }).tmux;
}

const REGISTRO_VIVA = {
  'proj-chat-1': { nombre: 'proj-chat-1', session_id: 'ses-a', estado: 'viva' },
};

test('"viva" en el registro pero sin pane en tmux (dormida por el orquestador): vivo false', async () => {
  await conEscenario(REGISTRO_VIVA, new Set(['otra-sesion']), async (projectDirectory) => {
    sessionsDb.createSession('ses-a', 'claude', projectDirectory, 'A');
    assert.deepEqual(await tmuxDeSesion('ses-a'), { nombre: 'proj-chat-1', vivo: false });
  });
});

test('"viva" en el registro y con su pane en tmux: vivo true', async () => {
  await conEscenario(REGISTRO_VIVA, new Set(['proj-chat-1']), async (projectDirectory) => {
    sessionsDb.createSession('ses-a', 'claude', projectDirectory, 'A');
    assert.deepEqual(await tmuxDeSesion('ses-a'), { nombre: 'proj-chat-1', vivo: true });
  });
});

test('tmux no disponible (null): se confía en el registro, como antes', async () => {
  await conEscenario(REGISTRO_VIVA, null, async (projectDirectory) => {
    sessionsDb.createSession('ses-a', 'claude', projectDirectory, 'A');
    assert.deepEqual(await tmuxDeSesion('ses-a'), { nombre: 'proj-chat-1', vivo: true });
  });
});

test('vivoEfectivoPorSesion + sesionesConVivoCambiado: las sesiones que pasaron a libre o a dormida', () => {
  const registro = {
    'proj-chat-1': { nombre: 'proj-chat-1', session_id: 'ses-a', estado: 'viva' as const },
    'proj-chat-2': { nombre: 'proj-chat-2', session_id: 'ses-b', estado: 'viva' as const },
    'proj-chat-3': { nombre: 'proj-chat-3', session_id: 'ses-c', estado: 'caida' as const },
    'sin-sid': { nombre: 'sin-sid', session_id: null, estado: 'viva' as const },
  };
  const antes = vivoEfectivoPorSesion(registro, new Set(['proj-chat-1', 'proj-chat-2', 'sin-sid']));
  assert.deepEqual([...antes], [['ses-a', true], ['ses-b', true], ['ses-c', false]]);

  // Se cae el pane de ses-a; ses-c la despierta el orquestador (vuelve "viva" y con pane).
  const registroDespues = { ...registro, 'proj-chat-3': { ...registro['proj-chat-3'], estado: 'viva' as const } };
  const despues = vivoEfectivoPorSesion(registroDespues, new Set(['proj-chat-2', 'proj-chat-3']));
  assert.deepEqual(sesionesConVivoCambiado(antes, despues).sort(), ['ses-a', 'ses-c']);
  assert.deepEqual(sesionesConVivoCambiado(despues, despues), []);
  // Una sesión viva que sale del registro también avisa.
  assert.deepEqual(sesionesConVivoCambiado(despues, new Map()).sort(), ['ses-b', 'ses-c']);
});

test('listarPanesTmux contra un tmux aislado (-L): ve el pane, deja de verlo al cerrarlo', async () => {
  const socket = `cloudcli-prueba-panes-${process.pid}`;
  const tmux = (...args: string[]) => execFileSync('tmux', ['-L', socket, ...args], { stdio: 'ignore' });
  try {
    assert.deepEqual(await listarPanesTmux(['-L', socket]), new Set(), 'sin servidor: ninguno vivo');
    tmux('new-session', '-d', '-s', 'proj-chat-1', 'sleep 60');
    tmux('new-session', '-d', '-s', 'proj-chat-2', 'sleep 60');
    assert.deepEqual(await listarPanesTmux(['-L', socket]), new Set(['proj-chat-1', 'proj-chat-2']));
    tmux('kill-session', '-t', '=proj-chat-1');
    assert.deepEqual(await listarPanesTmux(['-L', socket]), new Set(['proj-chat-2']));
  } finally {
    try {
      tmux('kill-server');
    } catch {
      // ya no había servidor
    }
  }
});
