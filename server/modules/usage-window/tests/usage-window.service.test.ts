import assert from 'node:assert/strict';
import test from 'node:test';

import { REAL_DATA_STALE_MS, seedDesdeArchivo, type EstadoVentanas } from '../services/usage-window.service.js';
import type { CuotaFileReading } from '../services/usage-window-cuota-file.service.js';

function readingFresco(now: number): CuotaFileReading {
  return {
    ts: now - 60_000, // 1 min de antigüedad
    fiveHour: { porcentaje: 42, resetsAt: now + 3_600_000, leidoEn: now - 60_000 },
    sevenDay: { porcentaje: 71, resetsAt: now + 86_400_000, leidoEn: now - 60_000 },
  };
}

function targetVacio(): EstadoVentanas {
  return { fiveHour: null, sevenDay: null };
}

test('seedDesdeArchivo llena el estado desde un reading fresco de cuota.json', () => {
  const now = Date.now();
  const target = targetVacio();

  const changed = seedDesdeArchivo(readingFresco(now), now, target);

  assert.equal(changed, true);
  assert.equal(target.fiveHour?.porcentaje, 42);
  assert.equal(target.sevenDay?.porcentaje, 71);
});

test('seedDesdeArchivo con reading más viejo que REAL_DATA_STALE_MS deja el estado en null', () => {
  const now = Date.now();
  const target = targetVacio();
  const reading = readingFresco(now);
  reading.ts = now - REAL_DATA_STALE_MS - 1_000; // justo por encima del límite de frescura

  const changed = seedDesdeArchivo(reading, now, target);

  assert.equal(changed, false);
  assert.equal(target.fiveHour, null);
  assert.equal(target.sevenDay, null);
});

test('seedDesdeArchivo sin archivo (reading null, cuota.json ausente) deja el estado en null', () => {
  const target = targetVacio();

  const changed = seedDesdeArchivo(null, Date.now(), target);

  assert.equal(changed, false);
  assert.equal(target.fiveHour, null);
  assert.equal(target.sevenDay, null);
});

test('seedDesdeArchivo nunca pisa un valor que el target ya tiene', () => {
  const now = Date.now();
  const target: EstadoVentanas = { fiveHour: { porcentaje: 10, resetsAt: null, leidoEn: now }, sevenDay: null };

  const changed = seedDesdeArchivo(readingFresco(now), now, target);

  assert.equal(changed, false);
  assert.equal(target.fiveHour?.porcentaje, 10);
  assert.equal(target.sevenDay, null);
});
