import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CUENTA_DEL_PROCESO,
  asegurarCuentaUsable,
  cuentaDeTmux,
  entornoParaCuenta,
  listarCuentas,
  prefijoShellDeCuenta,
  rutaArchivoCuota,
  validarCuenta,
} from '@/modules/cuentas/index.js';

// Valor ficticio: ningun test lee un .env real (REGLA 5).
const TOKEN_FICTICIO = 'sk-ant-oat01-FICTICIO-solo-para-tests-0000';

type Fixture = { dir: string; limpiar: () => Promise<void> };

/**
 * Registro de prueba: `personal` con credencial, `sinarchivo` apuntando a un
 * archivo que no existe y `vacia` con un archivo sin token.
 */
async function armarRegistro(): Promise<Fixture> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cuentas-test-'));
  const personal = path.join(dir, 'personal.env');
  const vacia = path.join(dir, 'vacia.env');
  await writeFile(personal, `# comentario\nCLAUDE_CODE_OAUTH_TOKEN=${TOKEN_FICTICIO}\nOTRA=no-se-extrae\n`, { mode: 0o600 });
  await writeFile(vacia, 'OTRA=1\n');
  const registro = path.join(dir, 'cuentas.json');
  await writeFile(
    registro,
    JSON.stringify({
      cuentas: [
        { id: 'optimum', proveedor: 'anthropic-oauth', plan: 'max', credencial: '~/.claude/token.env', defecto: true, uso: 'trabajo' },
        { id: 'personal', proveedor: 'anthropic-oauth', plan: 'max', credencial: personal, defecto: false, uso: 'propio' },
        { id: 'sinarchivo', credencial: path.join(dir, 'no-existe.env') },
        { id: 'vacia', credencial: vacia },
      ],
    }),
  );
  process.env.AOS_CUENTAS_JSON = registro;
  return {
    dir,
    limpiar: async () => {
      delete process.env.AOS_CUENTAS_JSON;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('la cuenta personal inyecta su token y AOS_CUENTA; el entorno base sigue intacto', async () => {
  const fx = await armarRegistro();
  try {
    const base: NodeJS.ProcessEnv = { PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'token-de-optimum-ficticio' };
    const env = entornoParaCuenta(base, 'personal');
    assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, TOKEN_FICTICIO);
    assert.equal(env.AOS_CUENTA, 'personal');
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(base.CLAUDE_CODE_OAUTH_TOKEN, 'token-de-optimum-ficticio', 'no muta el entorno base');
    assert.equal(base.AOS_CUENTA, undefined);
  } finally {
    await fx.limpiar();
  }
});

test('optimum (o sin cuenta) no pisa nada: devuelve el mismo entorno', async () => {
  const fx = await armarRegistro();
  try {
    const base: NodeJS.ProcessEnv = { CLAUDE_CODE_OAUTH_TOKEN: 'token-de-optimum-ficticio' };
    assert.equal(entornoParaCuenta(base, 'optimum'), base);
    assert.equal(entornoParaCuenta(base, null), base);
    assert.equal(entornoParaCuenta(base, undefined), base);
    assert.equal(base.AOS_CUENTA, undefined);
  } finally {
    await fx.limpiar();
  }
});

test('un id desconocido es un error claro, nunca optimum en silencio', async () => {
  const fx = await armarRegistro();
  try {
    assert.throws(() => entornoParaCuenta({}, 'fantasma'), (error: Error & { code?: string }) => {
      assert.equal(error.code, 'CUENTA_DESCONOCIDA');
      assert.match(error.message, /fantasma/);
      return true;
    });
    assert.throws(() => validarCuenta('../etc'), /no existe/);
    assert.throws(() => asegurarCuentaUsable('fantasma'), /fantasma/);
  } finally {
    await fx.limpiar();
  }
});

test('credencial ausente o sin token es un error claro y no filtra contenido', async () => {
  const fx = await armarRegistro();
  try {
    assert.throws(() => entornoParaCuenta({}, 'sinarchivo'), (error: Error & { code?: string }) => {
      assert.equal(error.code, 'CUENTA_SIN_CREDENCIAL');
      assert.match(error.message, /sinarchivo/);
      return true;
    });
    assert.throws(() => entornoParaCuenta({}, 'vacia'), (error: Error & { code?: string }) => {
      assert.equal(error.code, 'CUENTA_SIN_CREDENCIAL');
      assert.doesNotMatch(error.message, /OTRA=1/);
      return true;
    });
    assert.throws(() => asegurarCuentaUsable('sinarchivo'), /Falta la credencial/);
  } finally {
    await fx.limpiar();
  }
});

test('asegurarCuentaUsable devuelve el id canonico; optimum no necesita archivo', async () => {
  const fx = await armarRegistro();
  try {
    assert.equal(asegurarCuentaUsable('personal'), 'personal');
    assert.equal(asegurarCuentaUsable('optimum'), CUENTA_DEL_PROCESO);
    assert.equal(asegurarCuentaUsable(null), CUENTA_DEL_PROCESO);
  } finally {
    await fx.limpiar();
  }
});

test('el prefijo de shell del pane lee el archivo en el hijo: el token nunca esta en el comando', async () => {
  const fx = await armarRegistro();
  try {
    const prefijo = prefijoShellDeCuenta('personal');
    assert.match(prefijo, /^set -a; \. '.*personal\.env'; set \+a; export AOS_CUENTA=personal; $/);
    assert.ok(!prefijo.includes(TOKEN_FICTICIO), 'el token no puede viajar en el comando');
    assert.equal(prefijoShellDeCuenta('optimum'), '');
    assert.equal(prefijoShellDeCuenta(null), '');
    assert.throws(() => prefijoShellDeCuenta('sinarchivo'), /Falta la credencial/);
  } finally {
    await fx.limpiar();
  }
});

test('listarCuentas (lo que sale por HTTP) nunca trae token ni ruta de credencial', async () => {
  const fx = await armarRegistro();
  try {
    const cuentas = listarCuentas();
    assert.deepEqual(cuentas.map((cuenta) => cuenta.id), ['optimum', 'personal', 'sinarchivo', 'vacia']);
    const personal = cuentas.find((cuenta) => cuenta.id === 'personal');
    assert.deepEqual(personal, { id: 'personal', plan: 'max', defecto: false, uso: 'propio', disponible: true });
    assert.equal(cuentas.find((cuenta) => cuenta.id === 'sinarchivo')?.disponible, false);
    assert.equal(cuentas.find((cuenta) => cuenta.id === 'optimum')?.disponible, true);

    const serializado = JSON.stringify({ cuentas });
    assert.ok(!serializado.includes(TOKEN_FICTICIO));
    assert.ok(!serializado.includes('personal.env'));
    assert.ok(!serializado.includes(fx.dir));
    assert.ok(!/credencial/i.test(serializado));
  } finally {
    await fx.limpiar();
  }
});

test('sin registro legible queda solo optimum', async () => {
  process.env.AOS_CUENTAS_JSON = path.join(tmpdir(), 'no-existe-cuentas.json');
  try {
    assert.deepEqual(listarCuentas().map((cuenta) => cuenta.id), ['optimum']);
  } finally {
    delete process.env.AOS_CUENTAS_JSON;
  }
});

test('rutaArchivoCuota: optimum en cuota.json, el resto en cuota/<id>.json', () => {
  assert.equal(rutaArchivoCuota('optimum', '/x/aos/cuota.json'), '/x/aos/cuota.json');
  assert.equal(rutaArchivoCuota(null, '/x/aos/cuota.json'), '/x/aos/cuota.json');
  assert.equal(rutaArchivoCuota('personal', '/x/aos/cuota.json'), '/x/aos/cuota/personal.json');
  assert.throws(() => rutaArchivoCuota('../../etc/passwd', '/x/aos/cuota.json'), /invalido/);
});

test('cuentaDeTmux rechaza nombres que no son un nombre de sesion', async () => {
  assert.equal(await cuentaDeTmux('a b; rm -rf /'), null);
  assert.equal(await cuentaDeTmux(''), null);
});
