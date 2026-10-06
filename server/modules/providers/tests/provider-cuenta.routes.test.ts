import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express, { type NextFunction, type Request, type Response } from 'express';

import { cuentasRoutes } from '@/modules/cuentas/index.js';
import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import providerRouter from '@/modules/providers/provider.routes.js';
import { AppError } from '@/shared/utils.js';

// Valor ficticio: nunca se lee un .env real (REGLA 5).
const TOKEN_FICTICIO = 'sk-ant-oat01-FICTICIO-ruta-http-0000';

async function conServidor(
  run: (baseUrl: string, workspacePath: string) => Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousRegistro = process.env.AOS_CUENTAS_JSON;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'provider-cuenta-'));

  const credencial = path.join(tempDirectory, 'personal.env');
  await writeFile(credencial, `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN_FICTICIO}\n`, { mode: 0o600 });
  const registro = path.join(tempDirectory, 'cuentas.json');
  await writeFile(
    registro,
    JSON.stringify({
      cuentas: [
        { id: 'optimum', credencial: '~/.claude/token.env', defecto: true },
        { id: 'personal', plan: 'max', credencial, uso: 'propio' },
        { id: 'sinarchivo', credencial: path.join(tempDirectory, 'no-existe.env') },
      ],
    }),
  );
  process.env.AOS_CUENTAS_JSON = registro;

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await writeFile(process.env.DATABASE_PATH, '');
  await initializeDatabase();

  const app = express()
    .use(express.json())
    .use('/api/providers', providerRouter)
    .use('/api/cuentas', cuentasRoutes);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, path.join(tempDirectory, 'workspace'));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    closeConnection();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousRegistro === undefined) delete process.env.AOS_CUENTAS_JSON;
    else process.env.AOS_CUENTAS_JSON = previousRegistro;
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function crear(baseUrl: string, projectPath: string, extra: Record<string, unknown>): Promise<globalThis.Response> {
  return fetch(`${baseUrl}/api/providers/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'codex', projectPath, initialMessage: 'hola', ...extra }),
  });
}

test('crear una sesion con cuenta personal la guarda y la respuesta HTTP no trae el token', async () => {
  await conServidor(async (baseUrl, workspacePath) => {
    const response = await crear(baseUrl, workspacePath, { cuenta: 'personal' });
    const texto = await response.text();
    assert.equal(response.status, 201);

    const payload = JSON.parse(texto) as { data: { sessionId: string; cuenta: string | null } };
    assert.equal(payload.data.cuenta, 'personal');
    assert.equal(sessionsDb.getSessionById(payload.data.sessionId)?.cuenta, 'personal');

    assert.ok(!texto.includes(TOKEN_FICTICIO), 'el token no puede salir en la respuesta de /sessions');
    assert.ok(!texto.includes('personal.env'), 'la ruta de la credencial tampoco');
  });
});

test('sin cuenta la sesion queda en optimum (cuenta null) y no pisa nada', async () => {
  await conServidor(async (baseUrl, workspacePath) => {
    const response = await crear(baseUrl, workspacePath, {});
    const payload = await response.json() as { data: { sessionId: string; cuenta: string | null } };
    assert.equal(response.status, 201);
    assert.equal(payload.data.cuenta, null);
    assert.equal(sessionsDb.getSessionById(payload.data.sessionId)?.cuenta ?? null, null);
  });
});

test('una cuenta que no existe o sin credencial frena con error claro y no crea la sesion', async () => {
  await conServidor(async (baseUrl, workspacePath) => {
    const desconocida = await crear(baseUrl, workspacePath, { cuenta: 'fantasma' });
    const textoDesconocida = await desconocida.text();
    assert.equal(desconocida.status, 400);
    assert.match(textoDesconocida, /CUENTA_DESCONOCIDA/);
    assert.ok(!textoDesconocida.includes(TOKEN_FICTICIO));

    const sinCredencial = await crear(baseUrl, workspacePath, { cuenta: 'sinarchivo' });
    assert.equal(sinCredencial.status, 409);
    assert.match(await sinCredencial.text(), /CUENTA_SIN_CREDENCIAL/);

    assert.equal(sessionsDb.getSessionsByProjectPathIncludingArchived(workspacePath).length, 0);
  });
});

test('GET /api/cuentas lista las cuentas sin token ni rutas', async () => {
  await conServidor(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cuentas`);
    const texto = await response.text();
    assert.equal(response.status, 200);
    const payload = JSON.parse(texto) as { cuentas: Array<{ id: string; disponible: boolean }> };
    assert.deepEqual(payload.cuentas.map((cuenta) => cuenta.id), ['optimum', 'personal', 'sinarchivo']);
    assert.equal(payload.cuentas.find((cuenta) => cuenta.id === 'personal')?.disponible, true);
    assert.equal(payload.cuentas.find((cuenta) => cuenta.id === 'sinarchivo')?.disponible, false);
    assert.ok(!texto.includes(TOKEN_FICTICIO));
    assert.ok(!texto.includes('.env'));
  });
});
