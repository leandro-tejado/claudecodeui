import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  contenidoConAdjuntosParaTmux,
  filterAttachmentsToUploadStore,
  filterImagesToUploadStore,
} from '@/modules/websocket/services/chat-websocket.service.js';

const STORE = path.join(os.tmpdir(), 'cloudcli-assets-store');

test('images inside the upload store pass through', () => {
  const inside = path.join(STORE, 'shot.png');
  const result = filterImagesToUploadStore(
    [{ path: inside, name: 'shot.png', mimeType: 'image/png' }],
    STORE,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].path, inside);
});

test('bare filenames are anchored inside the store', () => {
  const result = filterImagesToUploadStore(['shot.png'], STORE);
  assert.equal(result.length, 1);
});

test('paths outside the store, traversal, and subdirs are dropped', () => {
  const result = filterImagesToUploadStore(
    [
      { path: 'C:/Users/victim/.ssh/id_rsa' },
      { path: '/etc/passwd' },
      { path: '../outside.png' },
      { path: path.join(STORE, '..', 'escaped.png') },
      { path: path.join(STORE, 'nested', 'deep.png') },
      { path: STORE }, // the store folder itself is not a file
    ],
    STORE,
  );
  assert.deepEqual(result, []);
});

test('malformed payloads yield no attachments', () => {
  assert.deepEqual(filterImagesToUploadStore(undefined, STORE), []);
  assert.deepEqual(filterImagesToUploadStore('nope', STORE), []);
  assert.deepEqual(filterImagesToUploadStore([{ name: 'no-path' }, 42], STORE), []);
});

test('general files inside the upload store preserve their metadata', () => {
  const inside = path.join(STORE, 'brief.pdf');
  const result = filterAttachmentsToUploadStore(
    [{ path: inside, name: 'brief.pdf', mimeType: 'application/pdf', size: 2048 }],
    STORE,
  );

  assert.deepEqual(result, [
    { path: inside, name: 'brief.pdf', mimeType: 'application/pdf', size: 2048 },
  ]);
});

test('tmux: el mensaje sin adjuntos queda igual', () => {
  assert.equal(contenidoConAdjuntosParaTmux('hola', { attachments: [] }, STORE), 'hola');
  assert.equal(contenidoConAdjuntosParaTmux('hola', undefined, STORE), 'hola');
});

test('tmux: un adjunto del store viaja como ruta absoluta, sin duplicar', () => {
  const dentro = path.join(STORE, 'shot.png');
  const resultado = contenidoConAdjuntosParaTmux(
    'mirá esto',
    { images: ['shot.png'], attachments: [{ path: dentro, name: 'shot.png', mimeType: 'image/png' }] },
    STORE,
  );
  assert.equal(resultado.startsWith('mirá esto\n\nArchivos adjuntos'), true);
  assert.equal(resultado.split(dentro).length - 1, 1);
});

test('tmux: una ruta fuera del store se descarta y no llega al pane', () => {
  const resultado = contenidoConAdjuntosParaTmux(
    'hola',
    { attachments: [{ path: '/etc/passwd', name: 'passwd' }, { path: '../secreto.png', name: 'x.png' }] },
    STORE,
  );
  assert.equal(resultado, 'hola');
});
