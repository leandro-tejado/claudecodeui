import assert from 'node:assert/strict';
import test from 'node:test';

import { seedDesdeArchivo, type EstadoVentanas } from '../services/usage-window.service.js';
import type { CuotaFileReading } from '../services/usage-window-cuota-file.service.js';

/**
 * `seedDesdeArchivo` ya no siembra una sola vez ni se niega a pisar: desde
 * la Fase 3 (05-oct) compara, ventana por ventana, el `leidoEn` de lo que ya
 * hay en `target` contra el de la lectura del archivo, y se queda con el
 * más nuevo de los dos. Ver el comentario de la función para el porqué.
 */

function readingFresco(overrides: Partial<CuotaFileReading> = {}): CuotaFileReading {
  const now = Date.now();
  return {
    ts: now,
    fiveHour: { porcentaje: 42, resetsAt: now + 3_600_000, leidoEn: now },
    sevenDay: { porcentaje: 71, resetsAt: now + 86_400_000, leidoEn: now },
    ...overrides,
  };
}

function targetVacio(): EstadoVentanas {
  return { fiveHour: null, sevenDay: null };
}

test('seedDesdeArchivo llena un target vacío con la lectura del archivo', () => {
  const target = targetVacio();

  const changed = seedDesdeArchivo(readingFresco(), target);

  assert.equal(changed, true);
  assert.equal(target.fiveHour?.porcentaje, 42);
  assert.equal(target.sevenDay?.porcentaje, 71);
});

test('seedDesdeArchivo sin archivo (reading null, cuota.json ausente o corrupto) deja el target intacto', () => {
  const now = Date.now();
  const target: EstadoVentanas = { fiveHour: { porcentaje: 10, resetsAt: null, leidoEn: now }, sevenDay: null };

  const changed = seedDesdeArchivo(null, target);

  assert.equal(changed, false);
  assert.equal(target.fiveHour?.porcentaje, 10);
  assert.equal(target.sevenDay, null);
});

test('seedDesdeArchivo pisa el target cuando la lectura del archivo es más nueva (la lectura más nueva gana)', () => {
  const vieja = Date.now() - 20 * 60_000;
  const target: EstadoVentanas = { fiveHour: { porcentaje: 10, resetsAt: null, leidoEn: vieja }, sevenDay: null };

  const changed = seedDesdeArchivo(readingFresco(), target);

  assert.equal(changed, true);
  assert.equal(target.fiveHour?.porcentaje, 42);
});

test('seedDesdeArchivo NO pisa el target cuando ya tiene la lectura más nueva (un rate_limit_event en vivo no se pierde)', () => {
  const masNueva = Date.now() + 5_000;
  const target: EstadoVentanas = {
    fiveHour: { porcentaje: 99, resetsAt: null, leidoEn: masNueva },
    sevenDay: { porcentaje: 88, resetsAt: null, leidoEn: masNueva },
  };

  const changed = seedDesdeArchivo(readingFresco(), target);

  assert.equal(changed, false);
  assert.equal(target.fiveHour?.porcentaje, 99);
  assert.equal(target.sevenDay?.porcentaje, 88);
});

test('seedDesdeArchivo mezcla por ventana: pisa solo la que el archivo tiene más nueva', () => {
  const now = Date.now();
  const target: EstadoVentanas = {
    fiveHour: { porcentaje: 10, resetsAt: null, leidoEn: now - 1_000 }, // más vieja que el archivo
    sevenDay: { porcentaje: 80, resetsAt: null, leidoEn: now + 10_000 }, // más nueva que el archivo
  };
  const reading = readingFresco({
    fiveHour: { porcentaje: 42, resetsAt: null, leidoEn: now },
    sevenDay: { porcentaje: 71, resetsAt: null, leidoEn: now },
  });

  const changed = seedDesdeArchivo(reading, target);

  assert.equal(changed, true);
  assert.equal(target.fiveHour?.porcentaje, 42); // pisada: el archivo era más nuevo
  assert.equal(target.sevenDay?.porcentaje, 80); // se mantiene: ya era más nueva que el archivo
});

test('seedDesdeArchivo con una sola ventana en el archivo no toca la otra', () => {
  const now = Date.now();
  const target: EstadoVentanas = { fiveHour: null, sevenDay: { porcentaje: 33, resetsAt: null, leidoEn: now } };
  const reading = readingFresco({ sevenDay: null });

  const changed = seedDesdeArchivo(reading, target);

  assert.equal(changed, true);
  assert.equal(target.fiveHour?.porcentaje, 42);
  assert.equal(target.sevenDay?.porcentaje, 33); // intacta: el archivo no traía sevenDay
});
