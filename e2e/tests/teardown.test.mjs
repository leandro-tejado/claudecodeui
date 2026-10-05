// El filtro del arnés se prueba solo, antes de usarlo contra tmux de verdad:
// un nombre sin el prefijo e2e- tira error ANTES de tocar nada.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cerrarTmux, crearTmux, exigirPrefijo, leerPane } from '../sesiones.mjs';

for (const nombre of ['web', 'orquestador', 'cloudcli-proyecto-6bf43915', 'E2E-mayus', 'xe2e-', '', undefined]) {
  test(`"${nombre}" no pasa el filtro`, () => {
    assert.throws(() => exigirPrefijo(nombre), /no empieza con e2e-/);
    assert.throws(() => cerrarTmux(nombre), /no empieza con e2e-/);
    assert.throws(() => leerPane(nombre), /no empieza con e2e-/);
    assert.throws(() => crearTmux(nombre), /no empieza con e2e-/);
  });
}

test('un nombre con el prefijo pasa', () => {
  assert.equal(exigirPrefijo('e2e-tmux-ejecutora-1'), 'e2e-tmux-ejecutora-1');
});
