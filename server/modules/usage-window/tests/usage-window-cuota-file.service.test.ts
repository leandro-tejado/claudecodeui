import assert from 'node:assert/strict';
import test from 'node:test';

import { leerCuotaFile } from '../services/usage-window-cuota-file.service.js';

// El watcher (`startCuotaFileWatch`/`stopCuotaFileWatch`) vive en su propio
// archivo, `usage-window-cuota-file-watch.service.test.ts`: necesita fijar
// `RUTA_CUOTA_JSON` ANTES de que el módulo se evalúe por primera vez (con un
// import dinámico), y este archivo ya lo importa estáticamente arriba — un
// import estático se resuelve antes que cualquier otra línea (hoisting de ES
// modules) y deja el módulo cacheado con la ruta real, así que un import
// dinámico posterior en el MISMO archivo reusaría ese mismo caché. Separarlo
// en otro archivo es lo que evita el problema.

/**
 * `leerCuotaFile` con `leerArchivo` inyectado: no toca el `cuota.json` real
 * (`~/.cache/aos/cuota.json`), que `RUTA_CUOTA_JSON` recién pisa en el
 * siguiente bloque — y solo para ESE archivo, por el truco de abajo.
 */

test('leerCuotaFile parsea una lectura válida y convierte los epoch a ms', () => {
  const ts = Math.floor(Date.now() / 1000);
  const crudo = JSON.stringify({
    ts,
    origen: 'statusline',
    maquina: 'vps',
    five_hour: 42,
    five_hour_resets_at: ts + 3600,
    seven_day: 71,
    seven_day_resets_at: ts + 4 * 86400,
    ctx: 1,
  });

  const reading = leerCuotaFile({ leerArchivo: () => crudo });

  assert.ok(reading);
  assert.equal(reading!.ts, ts * 1000);
  assert.equal(reading!.fiveHour?.porcentaje, 42);
  assert.equal(reading!.fiveHour?.resetsAt, (ts + 3600) * 1000);
  assert.equal(reading!.sevenDay?.porcentaje, 71);
});

test('leerCuotaFile con el archivo inexistente (ENOENT) da null, no tira', () => {
  const reading = leerCuotaFile({
    leerArchivo: () => {
      throw new Error('ENOENT: no such file or directory');
    },
  });

  assert.equal(reading, null);
});

test('leerCuotaFile con JSON corrupto da null, no tira', () => {
  const reading = leerCuotaFile({ leerArchivo: () => '{ esto no es json' });

  assert.equal(reading, null);
});

test('leerCuotaFile sin "ts" (forma inesperada) da null', () => {
  const reading = leerCuotaFile({ leerArchivo: () => JSON.stringify({ five_hour: 42 }) });

  assert.equal(reading, null);
});

test('leerCuotaFile con una ventana en null (sin dato todavía para esa ventana) no rompe la otra', () => {
  const ts = Math.floor(Date.now() / 1000);
  const crudo = JSON.stringify({ ts, five_hour: null, seven_day: 71, seven_day_resets_at: ts + 100 });

  const reading = leerCuotaFile({ leerArchivo: () => crudo });

  assert.ok(reading);
  assert.equal(reading!.fiveHour, null);
  assert.equal(reading!.sevenDay?.porcentaje, 71);
});

