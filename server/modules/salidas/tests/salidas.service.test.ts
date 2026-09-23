import assert from 'node:assert/strict';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createSalidasService, tipoDeSalida } from '@/modules/salidas/salidas.service.js';
import type { SalidasFileSystem, SalidasServiceDependencies } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

test('tipoDeSalida allows the whitelist and maps to the shared mime', () => {
  assert.deepEqual(tipoDeSalida('reporte.html'), { tipo: 'html', mime: 'text/html' });
  assert.deepEqual(tipoDeSalida('reporte.pdf'), { tipo: 'pdf', mime: 'application/pdf' });
  assert.deepEqual(tipoDeSalida('grafico.png'), { tipo: 'imagen', mime: 'image/png' });
  assert.deepEqual(tipoDeSalida('foto.jpg'), { tipo: 'imagen', mime: 'image/jpeg' });
  assert.deepEqual(tipoDeSalida('foto.jpeg'), { tipo: 'imagen', mime: 'image/jpeg' });
  assert.deepEqual(tipoDeSalida('icono.webp'), { tipo: 'imagen', mime: 'image/webp' });
  assert.deepEqual(tipoDeSalida('diagrama.svg'), { tipo: 'imagen', mime: 'image/svg+xml' });
  assert.deepEqual(tipoDeSalida('datos.csv'), { tipo: 'tabla', mime: 'text/csv' });
  assert.deepEqual(tipoDeSalida('notas.md'), { tipo: 'texto', mime: 'text/markdown' });
  assert.deepEqual(tipoDeSalida('notas.txt'), { tipo: 'texto', mime: 'text/plain' });
});

test('tipoDeSalida rejects anything outside the whitelist', () => {
  assert.equal(tipoDeSalida('.env'), null);
  assert.equal(tipoDeSalida('secrets'), null);
  assert.equal(tipoDeSalida('.gitignore'), null);
  assert.equal(tipoDeSalida('archivo.exe'), null);
});

test('tipoDeSalida is case-insensitive on the extension', () => {
  assert.deepEqual(tipoDeSalida('REPORTE.PDF'), { tipo: 'pdf', mime: 'application/pdf' });
});

function createFakeFileSystem(overrides: Partial<SalidasFileSystem> = {}): SalidasFileSystem {
  const unexpectedOperation = async (): Promise<never> => {
    throw new Error('Unexpected Salidas filesystem operation');
  };

  return {
    readDirectory: unexpectedOperation,
    stat: unexpectedOperation,
    createReadStream: () => Readable.from([]),
    ...overrides,
  };
}

function createDependencies(
  fileSystem: SalidasFileSystem,
  projectRoot: string | null,
): SalidasServiceDependencies {
  return {
    fileSystem,
    projects: {
      getProjectPathById: async () => projectRoot,
    },
    logger: { error: () => undefined },
  };
}

test('listarSalidas returns only whitelisted files with the documented shape', async () => {
  const projectRoot = path.resolve('salidas-test-project');
  const informesDirectory = path.join(projectRoot, '.informes');
  const mtime = new Date('2026-09-23T10:00:00.000Z');

  const fileSystem = createFakeFileSystem({
    readDirectory: async (directoryPath) => {
      assert.equal(directoryPath, informesDirectory);
      return ['reporte.html', '.env', 'sin-extension', 'datos.csv'];
    },
    stat: async (filePath) => ({
      size: filePath.endsWith('reporte.html') ? 1024 : 256,
      mtime,
      isFile: () => true,
    }),
  });

  const salidas = await createSalidasService(createDependencies(fileSystem, projectRoot))
    .listarSalidas('project-1');

  assert.deepEqual(salidas.map((salida) => salida.id).sort(), ['datos.csv', 'reporte.html']);
  assert.deepEqual(salidas.find((salida) => salida.id === 'reporte.html'), {
    id: 'reporte.html',
    tipo: 'html',
    bytes: 1024,
    ts: mtime.toISOString(),
  });
});

test('listarSalidas returns an empty list when .informes does not exist yet', async () => {
  const projectRoot = path.resolve('salidas-test-project-empty');
  const fileSystem = createFakeFileSystem({
    readDirectory: async () => {
      const error = new Error('no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    },
  });

  const salidas = await createSalidasService(createDependencies(fileSystem, projectRoot))
    .listarSalidas('project-1');

  assert.deepEqual(salidas, []);
});

test('listarSalidas skips directories that happen to carry a whitelisted extension', async () => {
  const projectRoot = path.resolve('salidas-test-project-dir');
  const fileSystem = createFakeFileSystem({
    readDirectory: async () => ['carpeta.html'],
    stat: async () => ({ size: 0, mtime: new Date(), isFile: () => false }),
  });

  const salidas = await createSalidasService(createDependencies(fileSystem, projectRoot))
    .listarSalidas('project-1');

  assert.deepEqual(salidas, []);
});

test('obtenerSalida rejects an unknown project with 404', async () => {
  const fileSystem = createFakeFileSystem();
  const service = createSalidasService(createDependencies(fileSystem, null));

  await assert.rejects(
    () => service.obtenerSalida('project-ajeno', 'reporte.html'),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test('obtenerSalida rejects a path-traversal id with 400 before touching the filesystem', async () => {
  const projectRoot = path.resolve('salidas-test-project-traversal');
  let statCalled = false;
  const fileSystem = createFakeFileSystem({
    stat: async () => {
      statCalled = true;
      throw new Error('should not be reached');
    },
  });
  const service = createSalidasService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    () => service.obtenerSalida('project-1', '../server.mjs'),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
  await assert.rejects(
    () => service.obtenerSalida('project-1', '..\\server.mjs'),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
  assert.equal(statCalled, false);
});

test('obtenerSalida rejects an id outside the whitelist with 400', async () => {
  const projectRoot = path.resolve('salidas-test-project-blocked-ext');
  const fileSystem = createFakeFileSystem();
  const service = createSalidasService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    () => service.obtenerSalida('project-1', '.env'),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
});

test('obtenerSalida rejects an output over the 25 MB cap with 413', async () => {
  const projectRoot = path.resolve('salidas-test-project-large');
  const fileSystem = createFakeFileSystem({
    stat: async () => ({ size: 26 * 1024 * 1024, mtime: new Date(), isFile: () => true }),
  });
  const service = createSalidasService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    () => service.obtenerSalida('project-1', 'reporte.pdf'),
    (error: unknown) => error instanceof AppError && error.statusCode === 413,
  );
});

test('obtenerSalida streams a valid output with its mime and byte count', async () => {
  const projectRoot = path.resolve('salidas-test-project-ok');
  const informesDirectory = path.join(projectRoot, '.informes');
  const streamedPaths: string[] = [];
  const fileSystem = createFakeFileSystem({
    stat: async (filePath) => {
      assert.equal(filePath, path.join(informesDirectory, 'reporte.pdf'));
      return { size: 2048, mtime: new Date(), isFile: () => true };
    },
    createReadStream: (filePath) => {
      streamedPaths.push(filePath);
      return Readable.from(['contenido']);
    },
  });
  const service = createSalidasService(createDependencies(fileSystem, projectRoot));

  const salida = await service.obtenerSalida('project-1', 'reporte.pdf');

  assert.equal(salida.tipo, 'pdf');
  assert.equal(salida.mime, 'application/pdf');
  assert.equal(salida.bytes, 2048);
  assert.deepEqual(streamedPaths, [path.join(informesDirectory, 'reporte.pdf')]);
});
