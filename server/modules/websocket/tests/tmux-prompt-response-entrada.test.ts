import assert from 'node:assert/strict';
import test from 'node:test';

import { leerEntradaTmuxPromptResponse } from '@/modules/websocket/services/chat-websocket.service.js';

/*
 * `leerEntradaTmuxPromptResponse` es pura (no toca tmux ni el socket por
 * defecto): separa lo que trae `chat.tmux-prompt-response` en una respuesta
 * simple (una opción o una tecla, como siempre) o una selección compuesta
 * (`seleccion: number[]`, Fase 11 paso 3) antes de que `handleTmuxPromptResponse`
 * elija entre `responderPromptTmux` y `responderSeleccionCompuestaTmux`.
 */

test('una selección (array) manda por el camino compuesto', () => {
  const entrada = leerEntradaTmuxPromptResponse({ seleccion: [0, 2] });
  assert.deepEqual(entrada, { tipo: 'compuesta', seleccion: [0, 2] });
});

test('la selección compuesta lleva el texto libre cuando viene', () => {
  const entrada = leerEntradaTmuxPromptResponse({ seleccion: [1], texto: 'Jueves' });
  assert.deepEqual(entrada, { tipo: 'compuesta', seleccion: [1], texto: 'Jueves' });
});

test('la selección compuesta descarta valores que no son número', () => {
  const entrada = leerEntradaTmuxPromptResponse({ seleccion: [0, '1', null, 2] });
  assert.deepEqual(entrada, { tipo: 'compuesta', seleccion: [0, 2] });
});

test('una opción numérica sigue mandando por el camino simple', () => {
  const entrada = leerEntradaTmuxPromptResponse({ opcion: 1, texto: 'hola' });
  assert.deepEqual(entrada, { tipo: 'simple', opcion: 1, tecla: undefined, texto: 'hola' });
});

test('una tecla suelta sigue mandando por el camino simple', () => {
  const entrada = leerEntradaTmuxPromptResponse({ tecla: 'Left' });
  assert.deepEqual(entrada, { tipo: 'simple', opcion: undefined, tecla: 'Left' });
});

test('sin opción, tecla ni selección cae en -1 (lo rechaza responderPromptTmux)', () => {
  const entrada = leerEntradaTmuxPromptResponse({});
  assert.deepEqual(entrada, { tipo: 'simple', opcion: -1, tecla: undefined });
});

test('`seleccion` gana si llegara junto con `opcion`', () => {
  const entrada = leerEntradaTmuxPromptResponse({ seleccion: [0], opcion: 3 });
  assert.equal(entrada.tipo, 'compuesta');
});
