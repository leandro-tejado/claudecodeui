import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';

import { cuentaDeTmux } from '@/modules/cuentas/index.js';
import { resolverCuentaDeSesion } from '@/modules/projects/index.js';

const execFileAsync = promisify(execFile);

function hayTmux(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Sesiones propias con prefijo: nunca se toca `web` ni las sesiones reales.
const PREFIJO = 'cuenta-test-';

test('cuentaDeTmux lee @cuenta de la sesion; vacio es optimum; inexistente es null', { skip: !hayTmux() && 'tmux no esta instalado' }, async () => {
  const conCuenta = `${PREFIJO}${randomUUID().slice(0, 8)}`;
  const sinCuenta = `${PREFIJO}${randomUUID().slice(0, 8)}`;
  try {
    await execFileAsync('tmux', ['new-session', '-d', '-s', conCuenta, 'cat']);
    await execFileAsync('tmux', ['new-session', '-d', '-s', sinCuenta, 'cat']);
    await execFileAsync('tmux', ['set-option', '-t', `=${conCuenta}:`, '@cuenta', 'personal']);

    assert.equal(await cuentaDeTmux(conCuenta), 'personal');
    assert.equal(await cuentaDeTmux(sinCuenta), 'optimum');
    assert.equal(await cuentaDeTmux(`${PREFIJO}no-existe-${randomUUID().slice(0, 8)}`), null);

    // El chip del sidebar: la fila gana; sin fila, la @cuenta de un tmux vivo.
    assert.equal(await resolverCuentaDeSesion('personal', null), 'personal');
    assert.equal(await resolverCuentaDeSesion(null, { nombre: conCuenta, vivo: true }), 'personal');
    assert.equal(await resolverCuentaDeSesion(null, { nombre: conCuenta, vivo: false }), null);
    assert.equal(await resolverCuentaDeSesion(null, null), null);
  } finally {
    for (const nombre of [conCuenta, sinCuenta]) {
      try {
        await execFileAsync('tmux', ['kill-session', '-t', `=${nombre}:`]);
      } catch {
        // ya cerrada
      }
    }
  }
});
