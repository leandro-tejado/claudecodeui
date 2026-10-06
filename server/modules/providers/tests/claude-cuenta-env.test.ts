import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { mapCliOptionsToSDK } from '@/modules/providers/list/claude/claude-runtime.provider.js';

// Valor ficticio: nunca se lee un .env real (REGLA 5).
const TOKEN_PERSONAL = 'sk-ant-oat01-FICTICIO-personal-0000';
const TOKEN_OPTIMUM_DEL_PROCESO = 'sk-ant-oat01-FICTICIO-optimum-1111';

function entorno(sdkOptions: { env?: unknown }): NodeJS.ProcessEnv {
  return sdkOptions.env as NodeJS.ProcessEnv;
}

async function conRegistro(run: () => void): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-cuenta-env-'));
  const credencial = path.join(dir, 'personal.env');
  await writeFile(credencial, `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN_PERSONAL}\n`, { mode: 0o600 });
  const registro = path.join(dir, 'cuentas.json');
  await writeFile(
    registro,
    JSON.stringify({
      cuentas: [
        { id: 'optimum', credencial: '~/.claude/token.env', defecto: true },
        { id: 'personal', credencial },
      ],
    }),
  );
  const previoRegistro = process.env.AOS_CUENTAS_JSON;
  const previoToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.AOS_CUENTAS_JSON = registro;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = TOKEN_OPTIMUM_DEL_PROCESO;
  try {
    run();
  } finally {
    if (previoRegistro === undefined) delete process.env.AOS_CUENTAS_JSON;
    else process.env.AOS_CUENTAS_JSON = previoRegistro;
    if (previoToken === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = previoToken;
    await rm(dir, { recursive: true, force: true });
  }
}

test('cuenta personal: el turno lleva su token y AOS_CUENTA=personal en sdkOptions.env', async () => {
  await conRegistro(() => {
    const sdkOptions = mapCliOptionsToSDK({ cuenta: 'personal' });
    assert.equal(entorno(sdkOptions).CLAUDE_CODE_OAUTH_TOKEN, TOKEN_PERSONAL);
    assert.equal(entorno(sdkOptions).AOS_CUENTA, 'personal');
    // El resto del entorno del proceso sigue ahi (el SDK reemplaza process.env).
    assert.equal(entorno(sdkOptions).PATH, process.env.PATH);
  });
});

test('cuenta optimum o sin cuenta: el entorno del turno no se pisa', async () => {
  await conRegistro(() => {
    for (const options of [{}, { cuenta: 'optimum' }, { cuenta: null }]) {
      const sdkOptions = mapCliOptionsToSDK(options);
      assert.equal(entorno(sdkOptions).CLAUDE_CODE_OAUTH_TOKEN, TOKEN_OPTIMUM_DEL_PROCESO);
      assert.equal(entorno(sdkOptions).AOS_CUENTA, undefined);
    }
  });
});

test('una cuenta desconocida frena el turno con error claro, no cae a optimum', async () => {
  await conRegistro(() => {
    assert.throws(() => mapCliOptionsToSDK({ cuenta: 'fantasma' }), /fantasma/);
  });
});
