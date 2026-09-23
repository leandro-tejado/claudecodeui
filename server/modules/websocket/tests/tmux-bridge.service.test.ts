import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  InvalidTmuxSessionNameError,
  asegurarSesionTmux,
  defaultAsegurarConfianzaProyecto,
  enviarPrompt,
  esFinDeTurno,
  esperarPrimerRender,
  leerUltimaFilaCruda,
  tieneSesionTmux,
} from '@/modules/websocket/services/tmux-bridge.service.js';
import { SALIDAS_SYSTEM_PROMPT_APPEND } from '@/modules/salidas/index.js';

// Mock por defecto para las pruebas de `asegurarSesionTmux` que no ejercen
// `asegurarConfianzaProyecto`: nunca debe tocar el `~/.claude.json` real de
// la maquina que corre los tests.
const confianzaNoop = async () => undefined;

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

const APP_SESSION_ID = 'app-session-9ad33076-d5c5-4ce1-b4be-08d20bd985b6';

test('asegurarSesionTmux: no crea nada si ya hay una pane viva (idempotente)', async () => {
  let llamadasACrear = 0;
  const creada = await asegurarSesionTmux('fase3-test-existente', '/tmp', null, APP_SESSION_ID, {
    hasSession: () => true,
    asegurarConfianzaProyecto: confianzaNoop,
    crearSesionDetached: async () => {
      llamadasACrear += 1;
    },
  });
  assert.equal(creada, false);
  assert.equal(llamadasACrear, 0);
});

test('asegurarSesionTmux: crea la pane con bypassPermissions y --session-id cuando no hay provider_session_id', async () => {
  const comandosRecibidos: string[][] = [];
  const creada = await asegurarSesionTmux('fase3-test-nueva', '/tmp/proyecto', null, APP_SESSION_ID, {
    hasSession: () => false,
    asegurarConfianzaProyecto: confianzaNoop,
    crearSesionDetached: async (_nombre, _cwd, comandoArgv) => {
      comandosRecibidos.push(comandoArgv);
    },
  });
  assert.ok(creada);
  assert.equal(comandosRecibidos.length, 1);
  const comandoRecibido = comandosRecibidos[0];
  assert.deepEqual(comandoRecibido.slice(0, 2), ['bash', '-ic']);
  const claudeCommand = comandoRecibido[2] ?? '';
  assert.ok(claudeCommand.includes('--dangerously-skip-permissions'));
  assert.ok(!claudeCommand.includes('--resume'));
  // Forces the fresh `claude` to mint its provider-native session id as this
  // app's own id, so the later file-watcher upsert lands on this same row
  // instead of orphaning it (16-sep finding: without this, the two ids never
  // meet and the chat window the user has open never hears the reply).
  assert.ok(claudeCommand.includes(`claude --session-id "${APP_SESSION_ID}" --dangerously-skip-permissions`));
  assert.ok(claudeCommand.includes('|| claude --dangerously-skip-permissions'));
});

test('asegurarSesionTmux: con provider_session_id arma un --resume con fallback a claude nuevo', async () => {
  let comandoRecibido: string[] | null = null;
  await asegurarSesionTmux('fase3-test-resume', '/tmp/proyecto', 'abc-123', APP_SESSION_ID, {
    hasSession: () => false,
    asegurarConfianzaProyecto: confianzaNoop,
    crearSesionDetached: async (_nombre, _cwd, comandoArgv) => {
      comandoRecibido = comandoArgv;
    },
  });
  const claudeCommand = comandoRecibido?.[2] ?? '';
  assert.ok(claudeCommand.includes('claude --resume "abc-123" --dangerously-skip-permissions'));
  assert.ok(claudeCommand.includes('|| claude --dangerously-skip-permissions'));
  // A resume already carries a real provider id — --session-id has no part here.
  assert.ok(!claudeCommand.includes('--session-id'));
});

test('asegurarSesionTmux: un provider_session_id fuera de charset se descarta en vez de interpolarse', async () => {
  let comandoRecibido: string[] | null = null;
  await asegurarSesionTmux('fase3-test-resume-malo', '/tmp/proyecto', '"; rm -rf ~ #', APP_SESSION_ID, {
    hasSession: () => false,
    asegurarConfianzaProyecto: confianzaNoop,
    crearSesionDetached: async (_nombre, _cwd, comandoArgv) => {
      comandoRecibido = comandoArgv;
    },
  });
  const claudeCommand = comandoRecibido?.[2] ?? '';
  assert.ok(!claudeCommand.includes('rm -rf'));
  assert.ok(!claudeCommand.includes('--resume'));
  // Falls through to the fresh-start branch, which still forces --session-id.
  assert.ok(claudeCommand.includes(`--session-id "${APP_SESSION_ID}"`));
});

test('asegurarSesionTmux: un appSessionId fuera de charset se descarta en vez de interpolarse', async () => {
  let comandoRecibido: string[] | null = null;
  await asegurarSesionTmux('fase3-test-appid-malo', '/tmp/proyecto', null, '"; rm -rf ~ #', {
    hasSession: () => false,
    asegurarConfianzaProyecto: confianzaNoop,
    crearSesionDetached: async (_nombre, _cwd, comandoArgv) => {
      comandoRecibido = comandoArgv;
    },
  });
  const claudeCommand = comandoRecibido?.[2] ?? '';
  assert.ok(!claudeCommand.includes('rm -rf'));
  assert.ok(!claudeCommand.includes('--session-id'));
  assert.equal(
    claudeCommand,
    "claude --dangerously-skip-permissions --append-system-prompt 'Los entregables (informes, PDFs, imagenes, CSV) se guardan en .informes/ con nombre descriptivo; lo que quede ahi aparece en el panel Salidas.'",
  );
});

test('asegurarSesionTmux: cada rama del comando lleva la convencion de .informes/ via --append-system-prompt', async () => {
  const capturarComando = async (
    providerSessionId: string | null,
    appSessionId: string,
  ): Promise<string> => {
    let comandoRecibido: string[] | null = null;
    await asegurarSesionTmux('fase7-test-append', '/tmp/proyecto', providerSessionId, appSessionId, {
      hasSession: () => false,
      asegurarConfianzaProyecto: confianzaNoop,
      crearSesionDetached: async (_nombre, _cwd, comandoArgv) => {
        comandoRecibido = comandoArgv;
      },
    });
    return comandoRecibido?.[2] ?? '';
  };

  const comandoResume = await capturarComando('abc-123', APP_SESSION_ID);
  const comandoSessionId = await capturarComando(null, APP_SESSION_ID);
  const comandoSinNada = await capturarComando(null, '"; rm -rf ~ #');

  for (const comando of [comandoResume, comandoSessionId, comandoSinNada]) {
    assert.ok(comando.includes(SALIDAS_SYSTEM_PROMPT_APPEND), comando);
    // The flag rides both sides of the `||` fallback, never just the first
    // attempt — a resume that fails still spawns a fresh `claude` process.
    assert.equal(
      comando.split('--append-system-prompt').length - 1,
      comando.includes('||') ? 2 : 1,
      comando,
    );
  }
});

test('asegurarSesionTmux: rechaza un cwd vacio en vez de abrir la pane en cualquier lado', async () => {
  await assert.rejects(
    () => asegurarSesionTmux('fase3-test-sin-cwd', '', null, APP_SESSION_ID, {
      hasSession: () => false,
      asegurarConfianzaProyecto: confianzaNoop,
      crearSesionDetached: async () => undefined,
    }),
    /cwd no vacio/,
  );
});

test('asegurarSesionTmux: rechaza nombres de sesion fuera de charset antes de tocar tmux', async () => {
  await assert.rejects(
    () => asegurarSesionTmux('; rm -rf ~ #', '/tmp', null, APP_SESSION_ID, {
      hasSession: () => {
        throw new Error('no deberia llegar aca');
      },
      asegurarConfianzaProyecto: confianzaNoop,
      crearSesionDetached: async () => undefined,
    }),
    InvalidTmuxSessionNameError,
  );
});

test('esperarPrimerRender: vuelve apenas la pantalla deja de estar en blanco', async () => {
  let llamadas = 0;
  const inicio = Date.now();
  await esperarPrimerRender('fase3-test-render', {
    capturarPaneCruda: async () => {
      llamadas += 1;
      return llamadas < 3 ? '' : 'Claude Code v2.1.273';
    },
  });
  const duracionMs = Date.now() - inicio;
  assert.equal(llamadas, 3);
  // Dos intervalos de 150ms entre el primer y el tercer intento, con margen.
  assert.ok(duracionMs < 5000, `no deberia haber agotado el limite de 5s: ${duracionMs}ms`);
});

test('esperarPrimerRender: se rinde en silencio si la pantalla nunca deja de estar en blanco', async () => {
  let llamadas = 0;
  await esperarPrimerRender('fase3-test-render-mudo', {
    capturarPaneCruda: async () => {
      llamadas += 1;
      return '';
    },
  });
  // No lanza: el llamador (enviarPrompt) es quien va a fallar si la pane
  // realmente nunca arranco.
  assert.ok(llamadas > 1);
});

test('esperarPrimerRender: un capture-pane que tira error cuenta como pantalla en blanco, no corta la espera', async () => {
  let llamadas = 0;
  await esperarPrimerRender('fase3-test-render-error', {
    capturarPaneCruda: async () => {
      llamadas += 1;
      if (llamadas < 2) {
        throw new Error('no hay tal pane todavia');
      }
      return 'listo';
    },
  });
  assert.equal(llamadas, 2);
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

// Regression for a 16-sep finding: a real Claude Code v2.1.273 transcript on
// this VPS appends six non-message bookkeeping rows after the last
// `assistant` row of every turn (`system`, `last-prompt`, `ai-title`, `mode`,
// `permission-mode`, `atis-latch`). Before this fix, `leerUltimaFilaCruda`
// returned whichever of those landed last, and `esFinDeTurno` — reading only
// that one row — read `type !== 'assistant'` as "still mid-turn", so
// `chat.send-tmux` never told the client the reply was done even though it
// had already arrived and rendered.
test('leerUltimaFilaCruda: las filas de bookkeeping despues del assistant no tapan el fin de turno', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-jsonl-'));
  const jsonlPath = path.join(tempDirectory, 'transcript.jsonl');
  const sessionId = 'session-fixture-3';

  try {
    const filas = [
      { type: 'user', uuid: 'u1', sessionId, message: { role: 'user', content: 'hola' } },
      {
        type: 'assistant',
        uuid: 'a1',
        sessionId,
        message: { role: 'assistant', content: 'fase3 ok', stop_reason: 'end_turn' },
      },
      { type: 'system', sessionId },
      { type: 'last-prompt', sessionId, lastPrompt: 'hola' },
      { type: 'ai-title', sessionId, aiTitle: 'fase3 ok' },
      { type: 'mode', sessionId },
      { type: 'permission-mode', sessionId },
      { type: 'atis-latch', sessionId },
    ];
    await writeFile(jsonlPath, `${filas.map((fila) => JSON.stringify(fila)).join('\n')}\n`, 'utf8');

    const ultima = await leerUltimaFilaCruda(jsonlPath, sessionId);
    assert.equal(ultima?.type, 'assistant');
    assert.equal(esFinDeTurno(ultima ? [ultima] : []), true);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('asegurarSesionTmux: aprueba la confianza del proyecto antes de crear la pane, nunca despues', async () => {
  const orden: string[] = [];
  await asegurarSesionTmux('fase3-test-orden-confianza', '/tmp/proyecto', null, APP_SESSION_ID, {
    hasSession: () => false,
    asegurarConfianzaProyecto: async () => {
      orden.push('confianza');
    },
    crearSesionDetached: async () => {
      orden.push('crear-pane');
    },
  });
  assert.deepEqual(orden, ['confianza', 'crear-pane']);
});

test('asegurarSesionTmux: no toca la confianza del proyecto si ya hay una pane viva', async () => {
  let llamadas = 0;
  await asegurarSesionTmux('fase3-test-sin-confianza-si-ya-existe', '/tmp/proyecto', null, APP_SESSION_ID, {
    hasSession: () => true,
    asegurarConfianzaProyecto: async () => {
      llamadas += 1;
    },
    crearSesionDetached: async () => undefined,
  });
  assert.equal(llamadas, 0);
});

test('defaultAsegurarConfianzaProyecto: crea la entrada del proyecto cuando el archivo no existe todavia', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-claude-json-'));
  const rutaClaudeJson = path.join(tempDirectory, '.claude.json');

  try {
    await defaultAsegurarConfianzaProyecto('/home/leantejado/proyecto-nuevo', rutaClaudeJson);
    const config = JSON.parse(await readFile(rutaClaudeJson, 'utf8'));
    assert.deepEqual(config.projects['/home/leantejado/proyecto-nuevo'], {
      hasTrustDialogAccepted: true,
      hasClaudeMdExternalIncludesApproved: true,
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('defaultAsegurarConfianzaProyecto: preserva el resto del archivo y de la entrada del proyecto', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-claude-json-'));
  const rutaClaudeJson = path.join(tempDirectory, '.claude.json');
  const cwd = '/home/leantejado/workspace-leandro/clientes/optimum/desarrollo/app-optimum-main';

  const configOriginal = {
    mcpServers: { 'cloudcli-browser': { env: { CLOUDCLI_BROWSER_USE_API_URL: 'http://100.77.186.53:3001' } } },
    projects: {
      '/otro/proyecto': { hasTrustDialogAccepted: true },
      [cwd]: {
        allowedTools: ['Bash(git *)'],
        hasTrustDialogAccepted: false,
        hasClaudeMdExternalIncludesApproved: false,
      },
    },
  };

  try {
    await writeFile(rutaClaudeJson, JSON.stringify(configOriginal, null, 2), 'utf8');
    await defaultAsegurarConfianzaProyecto(cwd, rutaClaudeJson);
    const config = JSON.parse(await readFile(rutaClaudeJson, 'utf8'));

    assert.deepEqual(config.mcpServers, configOriginal.mcpServers);
    assert.deepEqual(config.projects['/otro/proyecto'], { hasTrustDialogAccepted: true });
    assert.deepEqual(config.projects[cwd], {
      allowedTools: ['Bash(git *)'],
      hasTrustDialogAccepted: true,
      hasClaudeMdExternalIncludesApproved: true,
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('defaultAsegurarConfianzaProyecto: idempotente en dos llamadas seguidas', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'tmux-bridge-claude-json-'));
  const rutaClaudeJson = path.join(tempDirectory, '.claude.json');
  const cwd = '/tmp/proyecto-idempotente';

  try {
    await defaultAsegurarConfianzaProyecto(cwd, rutaClaudeJson);
    const primeraPasada = await readFile(rutaClaudeJson, 'utf8');
    await defaultAsegurarConfianzaProyecto(cwd, rutaClaudeJson);
    const segundaPasada = await readFile(rutaClaudeJson, 'utf8');

    assert.equal(primeraPasada, segundaPasada);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
