import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import test from 'node:test';

import express from 'express';

import { createSalidasRouter } from '@/modules/salidas/salidas.routes.js';
import { createSalidasService } from '@/modules/salidas/salidas.service.js';
import type { SalidasFileSystem, SalidasLogger, SalidasServices } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

function createFakeServices(overrides: Partial<SalidasServices> = {}): SalidasServices {
  const unexpectedOperation = async (): Promise<never> => {
    throw new Error('Unexpected Salidas service call');
  };

  return {
    listarSalidas: unexpectedOperation,
    obtenerSalida: unexpectedOperation,
    ...overrides,
  };
}

const silentLogger: SalidasLogger = { error: () => undefined };

async function withSalidasServer(
  services: SalidasServices,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use('/api/projects', createSalidasRouter(services, silentLogger));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('GET /api/projects/:projectId/salidas lists outputs in the success envelope', async () => {
  const inputs: string[] = [];
  const services = createFakeServices({
    listarSalidas: async (projectId) => {
      inputs.push(projectId);
      return [{ id: 'reporte.html', tipo: 'html', bytes: 1024, ts: '2026-09-23T10:00:00.000Z' }];
    },
  });

  await withSalidasServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/project-1/salidas`);
    const payload = await response.json() as { success: boolean; data: unknown[] };

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.deepEqual(payload.data, [
      { id: 'reporte.html', tipo: 'html', bytes: 1024, ts: '2026-09-23T10:00:00.000Z' },
    ]);
  });

  assert.deepEqual(inputs, ['project-1']);
});

test('GET /api/projects/:projectId/salidas/:id streams the output with its mime and security headers', async () => {
  const requestedIds: Array<[string, string]> = [];
  const services = createFakeServices({
    obtenerSalida: async (projectId, id) => {
      requestedIds.push([projectId, id]);
      return {
        tipo: 'pdf' as const,
        mime: 'application/pdf',
        bytes: 4,
        stream: Readable.from([Buffer.from('%PDF')]),
      };
    },
  });

  await withSalidasServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/project-1/salidas/reporte.pdf`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await response.text(), '%PDF');
  });

  assert.deepEqual(requestedIds, [['project-1', 'reporte.pdf']]);
});

test('GET .../salidas/:id sets a strict CSP only for SVG output', async () => {
  const services = createFakeServices({
    obtenerSalida: async () => ({
      tipo: 'imagen' as const,
      mime: 'image/svg+xml',
      bytes: 3,
      stream: Readable.from([Buffer.from('svg')]),
    }),
  });

  await withSalidasServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/project-1/salidas/icono.svg`);

    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
  });
});

test('GET /api/projects/:projectId/salidas rejects an empty projectId with 400 before calling the service', async () => {
  let serviceCalled = false;
  const services = createFakeServices({
    listarSalidas: async () => {
      serviceCalled = true;
      return [];
    },
  });

  await withSalidasServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/%20/salidas`);
    // A whitespace-only projectId is rejected by readProjectId's trim() check.
    assert.equal(response.status, 400);
  });

  assert.equal(serviceCalled, false);
});

test('GET /api/projects/:projectId/salidas surfaces a project-not-found service error as 404', async () => {
  const services = createFakeServices({
    listarSalidas: async () => {
      throw new AppError('Project not found', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    },
  });

  await withSalidasServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/project-ajeno/salidas`);
    assert.equal(response.status, 404);
  });
});

// Exercises the router against the real service + a real (temp-backed)
// filesystem, wiring the same production shape the module composition root
// uses — closest this suite gets to a live end-to-end check without a
// running server, per the harness rule to prefer a local equivalent over
// "no verificable" when one is feasible.
test('router + real service: traversal via the id is blocked end to end', async () => {
  const fileSystem: SalidasFileSystem = {
    readDirectory: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    stat: async () => { throw new Error('stat should not be reached for a rejected id'); },
    createReadStream: () => Readable.from([]),
  };
  const services = createSalidasService({
    fileSystem,
    projects: { getProjectPathById: async () => '/tmp/salidas-e2e-project' },
    logger: silentLogger,
  });

  await withSalidasServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/project-1/salidas/..%2Fserver.mjs`);
    assert.equal(response.status, 400);
  });
});
