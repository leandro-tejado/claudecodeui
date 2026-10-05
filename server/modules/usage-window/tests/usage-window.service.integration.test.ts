import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSnapshot, getUsageWindow, recordRateLimitReading } from '../services/usage-window.service.js';
import type { CuotaFileReading } from '../services/usage-window-cuota-file.service.js';

/**
 * Ejercita el singleton real del módulo, en el orden en que ocurriría en
 * un proceso recién levantado: primero sin dato, después con `cuota.json`
 * fresco, después con un `rate_limit_event` real, y por último con
 * `cuota.json` reescrito de nuevo (Fase 3, 05-oct: `getUsageWindow` relee el
 * archivo en cada llamada, no solo una vez al boot). node:test corre los
 * `test()` de un mismo archivo en el orden en que se definen, así que el
 * estado se arrastra a propósito de uno al siguiente — igual que en el
 * proceso real, donde `state` también es un singleton.
 */

function readingFresco(now: number, overrides: Partial<CuotaFileReading> = {}): CuotaFileReading {
  return {
    ts: now,
    fiveHour: { porcentaje: 42, resetsAt: now + 3_600_000, leidoEn: now },
    sevenDay: { porcentaje: 71, resetsAt: now + 86_400_000, leidoEn: now },
    ...overrides,
  };
}

test('getUsageWindow sin cuota.json (proceso recién levantado) devuelve null, no inventa nada', async () => {
  const snapshot = await getUsageWindow({ leerCuotaFile: () => null });

  assert.equal(snapshot.fiveHour, null);
  assert.equal(snapshot.sevenDay, null);
});

test('getUsageWindow con cuota.json fresco siembra el snapshot sin esperar un rate_limit_event', async () => {
  const now = Date.now();

  const snapshot = await getUsageWindow({ leerCuotaFile: () => readingFresco(now) });

  assert.equal(snapshot.fiveHour?.porcentaje, 42);
  assert.equal(snapshot.sevenDay?.porcentaje, 71);
});

test('un rate_limit_event real posterior pisa el valor sembrado', () => {
  const now = Date.now();

  const changed = recordRateLimitReading({
    unifiedWindows: {
      five_hour: { utilization: 0.99, resetsAt: Math.floor(now / 1000) + 100 },
    },
  });

  assert.equal(changed, true);
  const snapshot = buildSnapshot();
  assert.equal(snapshot.fiveHour?.porcentaje, 99); // el evento real pisó el 42 sembrado
  assert.equal(snapshot.sevenDay?.porcentaje, 71); // este evento no traía seven_day: queda el sembrado
});

test('getUsageWindow relee cuota.json en cada llamada: una escritura más nueva que el evento en vivo lo pisa', async () => {
  const now = Date.now() + 10_000; // más nuevo que el rate_limit_event del test anterior
  const masNueva = readingFresco(now, {
    fiveHour: { porcentaje: 55, resetsAt: now + 3_600_000, leidoEn: now },
    sevenDay: null,
  });

  const snapshot = await getUsageWindow({ leerCuotaFile: () => masNueva });

  assert.equal(snapshot.fiveHour?.porcentaje, 55); // el archivo, más nuevo, pisó el 99 en vivo
  assert.equal(snapshot.sevenDay?.porcentaje, 71); // esta lectura no traía sevenDay: queda lo que había
});

test('getUsageWindow relee cuota.json en cada llamada: una lectura vieja del archivo no pisa el estado en memoria', async () => {
  const vieja = Date.now() - 20 * 60_000;
  const reading = readingFresco(vieja, {
    fiveHour: { porcentaje: 1, resetsAt: null, leidoEn: vieja },
    sevenDay: null,
  });

  const snapshot = await getUsageWindow({ leerCuotaFile: () => reading });

  assert.equal(snapshot.fiveHour?.porcentaje, 55); // se mantiene: el archivo traía una lectura más vieja
});

test('getUsageWindow con cuota.json ausente o corrupto (leerCuotaFile devuelve null) no borra lo que ya había', async () => {
  const snapshot = await getUsageWindow({ leerCuotaFile: () => null });

  assert.equal(snapshot.fiveHour?.porcentaje, 55);
  assert.equal(snapshot.sevenDay?.porcentaje, 71);
});
