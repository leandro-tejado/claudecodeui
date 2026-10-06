import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { asegurarSesionTmux } from '@/modules/websocket/services/tmux-bridge.service.js';

// Valor ficticio: nunca se lee un .env real (REGLA 5).
const TOKEN_FICTICIO = 'sk-ant-oat01-FICTICIO-tmux-0000';
const APP_SESSION_ID = 'app-session-0a1b2c3d-0000-4000-8000-000000000001';

async function conRegistro(run: (credencial: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tmux-cuenta-'));
  const credencial = path.join(dir, 'personal.env');
  await writeFile(credencial, `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN_FICTICIO}\n`, { mode: 0o600 });
  const registro = path.join(dir, 'cuentas.json');
  await writeFile(
    registro,
    JSON.stringify({ cuentas: [{ id: 'optimum', credencial: '~/.claude/token.env', defecto: true }, { id: 'personal', credencial }] }),
  );
  const previo = process.env.AOS_CUENTAS_JSON;
  process.env.AOS_CUENTAS_JSON = registro;
  try {
    await run(credencial);
  } finally {
    if (previo === undefined) delete process.env.AOS_CUENTAS_JSON;
    else process.env.AOS_CUENTAS_JSON = previo;
    await rm(dir, { recursive: true, force: true });
  }
}

function dependencias() {
  const comandos: string[][] = [];
  const marcas: Array<[string, string]> = [];
  return {
    comandos,
    marcas,
    deps: {
      hasSession: () => false,
      asegurarConfianzaProyecto: async () => undefined,
      crearSesionDetached: async (_nombre: string, _cwd: string, argv: string[]) => {
        comandos.push(argv);
      },
      marcarCuenta: async (nombre: string, cuenta: string) => {
        marcas.push([nombre, cuenta]);
      },
    },
  };
}

test('cuenta personal: el pane carga su credencial tras el .bashrc, se marca @cuenta y el token no va en el comando', async () => {
  await conRegistro(async (credencial) => {
    const { comandos, marcas, deps } = dependencias();
    const creada = await asegurarSesionTmux('fase3-test-cuenta', '/tmp', null, APP_SESSION_ID, deps, 'personal');
    assert.ok(creada);
    const [argv] = comandos;
    assert.deepEqual(argv.slice(0, 2), ['bash', '-ic']);
    assert.ok(argv[2].startsWith(`set -a; . '${credencial}'; set +a; export AOS_CUENTA=personal; claude`));
    assert.ok(!argv.join(' ').includes(TOKEN_FICTICIO), 'el token no puede viajar por el argv del pane');
    assert.deepEqual(marcas, [['fase3-test-cuenta', 'personal']]);
  });
});

test('sin cuenta el comando queda como siempre y la sesion se marca optimum', async () => {
  await conRegistro(async () => {
    const { comandos, marcas, deps } = dependencias();
    await asegurarSesionTmux('fase3-test-sin-cuenta', '/tmp', null, APP_SESSION_ID, deps);
    assert.ok(comandos[0][2].startsWith('claude'), 'sin prefijo para la cuenta del proceso');
    assert.ok(!comandos[0][2].includes('AOS_CUENTA'));
    assert.deepEqual(marcas, [['fase3-test-sin-cuenta', 'optimum']]);
  });
});

test('una cuenta desconocida frena antes de abrir el pane', async () => {
  await conRegistro(async () => {
    const { comandos, marcas, deps } = dependencias();
    await assert.rejects(
      asegurarSesionTmux('fase3-test-fantasma', '/tmp', null, APP_SESSION_ID, deps, 'fantasma'),
      /fantasma/,
    );
    assert.equal(comandos.length, 0);
    assert.equal(marcas.length, 0);
  });
});
