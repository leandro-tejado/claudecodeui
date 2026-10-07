import assert from 'node:assert/strict';
import test from 'node:test';

import { sesionesConVivoCambiado } from '@/modules/projects/index.js';
import { crearVigiaTmux } from '@/modules/providers/services/vigia-tmux.service.js';

/*
 * Bug del 07-oct: una fila de la barra no se enteraba de que su pane de tmux
 * había muerto (o revivido) hasta recargar. El vigía devuelve, en cada
 * pasada, las sesiones cuyo tmux cambió desde la anterior.
 */
test('la primera pasada toma la foto; las siguientes devuelven solo lo que cambió', async () => {
  const fotos = [
    new Map([['ses-a', true], ['ses-b', true]]),
    new Map([['ses-a', true], ['ses-b', true]]),
    new Map([['ses-a', false], ['ses-b', true]]),
    new Map([['ses-a', true], ['ses-b', true], ['ses-c', true]]),
  ];
  const revisar = crearVigiaTmux({
    leerVivos: async () => fotos.shift() ?? new Map(),
    diferencias: sesionesConVivoCambiado,
  });

  assert.deepEqual(await revisar(), [], 'primera pasada: sin comparación');
  assert.deepEqual(await revisar(), [], 'nada cambió');
  assert.deepEqual(await revisar(), ['ses-a'], 'murió el pane de ses-a');
  assert.deepEqual((await revisar()).sort(), ['ses-a', 'ses-c'], 'ses-a revivió y apareció ses-c');
});

test('dos pasadas encimadas no leen tmux dos veces', async () => {
  let lecturas = 0;
  let soltar: () => void = () => {};
  const revisar = crearVigiaTmux({
    leerVivos: () => {
      lecturas += 1;
      return new Promise((resolve) => {
        soltar = () => resolve(new Map());
      });
    },
    diferencias: sesionesConVivoCambiado,
  });

  const primera = revisar();
  assert.deepEqual(await revisar(), []);
  soltar();
  await primera;
  assert.equal(lecturas, 1);
});
