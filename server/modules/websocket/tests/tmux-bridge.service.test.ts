import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  InvalidTmuxSessionNameError,
  enviarPrompt,
  esFinDeTurno,
  leerUltimaFilaCruda,
  tieneSesionTmux,
} from '@/modules/websocket/services/tmux-bridge.service.js';

const execFileAsync = promisify(execFile);

// Every test session this file creates carries this prefix, per the fase's
// ground rule: never touch `web` (ttyd) or `fase2` (Leandro's live session).
const PREFIX = 'fase3-test-';

function nombreDePrueba(): string {
  return `${PREFIX}${randomUUID().slice(0, 8)}`;
}

async function crearSesionDePrueba(nombre: string): Promise<void> {
  // A plain `cat` pane: it echoes nothing back on its own, so `send-keys -l`
  // followed by `Enter` puts the literal bytes on its own newline-terminated
  // line in the pane, which `capture-pane` can then assert against exactly.
  await execFileAsync('tmux', ['new-session', '-d', '-s', nombre, 'cat']);
}

async function matarSesionDePrueba(nombre: string): Promise<void> {
  try {
    await execFileAsync('tmux', ['kill-session', '-t', nombre]);
  } catch {
    // Already gone — nothing to clean up.
  }
}

async function capturarPane(nombre: string): Promise<string> {
  const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-t', nombre]);
  return stdout;
}

test('un prompt de una linea aparece entero en la sesion de tmux', async () => {
  const nombre = nombreDePrueba();
  await crearSesionDePrueba(nombre);
  try {
    await enviarPrompt(nombre, 'hola desde el chat de cloudcli');
    // `cat` needs a tick to echo the line back into the pane buffer.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pantalla = await capturarPane(nombre);
    assert.ok(
      pantalla.includes('hola desde el chat de cloudcli'),
      `la pantalla no tiene el texto exacto:\n${pantalla}`
    );
  } finally {
    await matarSesionDePrueba(nombre);
  }
});

test('un prompt de varias lineas no se manda cortado', async () => {
  const nombre = nombreDePrueba();
  await crearSesionDePrueba(nombre);
  try {
    const texto = 'primera linea\nsegunda linea\ntercera linea';
    await enviarPrompt(nombre, texto);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pantalla = await capturarPane(nombre);
    for (const linea of texto.split('\n')) {
      assert.ok(pantalla.includes(linea), `falta la linea "${linea}" en:\n${pantalla}`);
    }
  } finally {
    await matarSesionDePrueba(nombre);
  }
});

test('el texto del usuario nunca se interpola en la linea de comando', async () => {
  const nombre = nombreDePrueba();
  await crearSesionDePrueba(nombre);
  try {
    const cargaMaliciosa = '"; tmux kill-server; #';
    await enviarPrompt(nombre, cargaMaliciosa);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // La sesion sigue viva: si el texto se hubiera interpolado en un shell,
    // este `has-session` fallaria porque el servidor de tmux entero habria
    // muerto con el resto de las sesiones (incluidas `web` y `fase2`).
    execFileSync('tmux', ['has-session', '-t', nombre], { stdio: 'ignore' });

    const pantalla = await capturarPane(nombre);
    assert.ok(pantalla.includes(cargaMaliciosa), `no llego el texto literal:\n${pantalla}`);
  } finally {
    await matarSesionDePrueba(nombre);
  }
});

test('rechaza nombres de sesion que no vienen de nombreTmux()', async () => {
  await assert.rejects(
    () => enviarPrompt('; rm -rf ~ #', 'hola'),
    InvalidTmuxSessionNameError,
  );
});

test('tieneSesionTmux distingue una sesion viva de una que no existe', async () => {
  const nombre = nombreDePrueba();
  assert.equal(tieneSesionTmux(nombre), false);

  await crearSesionDePrueba(nombre);
  try {
    assert.equal(tieneSesionTmux(nombre), true);
  } finally {
    await matarSesionDePrueba(nombre);
  }
  assert.equal(tieneSesionTmux(nombre), false);
});

test('tieneSesionTmux nunca ejecuta tmux con un nombre fuera de charset', () => {
  // Un nombre con `;` no debe ni intentar shelling out — se rechaza por
  // regex antes de tocar `hasSession`.
  assert.equal(tieneSesionTmux('sesion; touch /tmp/deberia-no-existir-nunca'), false);
});

test('esFinDeTurno: false cuando no hay filas', () => {
  assert.equal(esFinDeTurno([]), false);
});

test('esFinDeTurno: false mientras la ultima fila es assistant con tool_use pendiente', () => {
  assert.equal(
    esFinDeTurno([
      { type: 'user', sessionId: 's1' },
      { type: 'assistant', sessionId: 's1', message: { stop_reason: 'tool_use' } },
    ]),
    false,
  );
});

// Fixture verificada 16-sep contra un .jsonl real de este VPS
// (~/.claude/projects/-home-leantejado-worktrees-cloudcli-fase2-tmux/*.jsonl,
// 393 lineas): ninguna fila tiene `type: "result"` ni `parent_tool_use_id` —
// esos campos no existen en el formato que escribe Claude Code. La señal real
// es `message.stop_reason` en la ultima fila `assistant`.
test('esFinDeTurno: true cuando la ultima fila assistant termina con un stop_reason que no es tool_use', () => {
  assert.equal(
    esFinDeTurno([
      { type: 'user', sessionId: 's1' },
      { type: 'assistant', sessionId: 's1', message: { stop_reason: 'tool_use' } },
      { type: 'user', sessionId: 's1' },
      { type: 'assistant', sessionId: 's1', message: { stop_reason: 'end_turn' } },
    ]),
    true,
  );
});

test('esFinDeTurno: una fila de subagente (isSidechain) no cuenta como fin del turno principal', () => {
  assert.equal(
    esFinDeTurno([
      { type: 'assistant', sessionId: 's1', message: { stop_reason: 'tool_use' } },
      { type: 'assistant', sessionId: 's1', isSidechain: true, message: { stop_reason: 'end_turn' } },
    ]),
    false,
  );
});

test('leerUltimaFilaCruda: lee sobre un .jsonl de ejemplo sin capture-pane', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-jsonl-'));
  const jsonlPath = path.join(tempDirectory, 'transcript.jsonl');
  const sessionId = 'session-fixture-1';

  try {
    const filas = [
      { type: 'user', uuid: 'u1', sessionId, message: { role: 'user', content: 'hola' } },
      {
        type: 'assistant',
        uuid: 'a1',
        sessionId,
        message: { role: 'assistant', content: 'hola de vuelta', stop_reason: 'end_turn' },
      },
    ];
    await writeFile(jsonlPath, `${filas.map((fila) => JSON.stringify(fila)).join('\n')}\n`, 'utf8');

    const ultima = await leerUltimaFilaCruda(jsonlPath, sessionId);
    assert.ok(ultima);
    assert.equal(ultima?.type, 'assistant');
    assert.equal(esFinDeTurno([ultima!]), true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('leerUltimaFilaCruda: filas de otra sesion en el mismo archivo se ignoran', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-jsonl-'));
  const jsonlPath = path.join(tempDirectory, 'transcript.jsonl');
  const sessionId = 'session-fixture-2';

  try {
    const filas = [
      { type: 'assistant', uuid: 'a1', sessionId, message: { stop_reason: 'end_turn' } },
      { type: 'assistant', uuid: 'a-otra', sessionId: 'otra-sesion', message: { stop_reason: 'end_turn' } },
    ];
    await writeFile(jsonlPath, `${filas.map((fila) => JSON.stringify(fila)).join('\n')}\n`, 'utf8');

    const ultima = await leerUltimaFilaCruda(jsonlPath, sessionId);
    assert.equal(ultima?.sessionId, sessionId);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
