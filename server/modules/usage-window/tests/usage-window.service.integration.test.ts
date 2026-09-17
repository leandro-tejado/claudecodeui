import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSnapshot, getUsageWindow, recordRateLimitReading } from '../services/usage-window.service.js';
import type { CuotaFileReading } from '../services/usage-window-cuota-file.service.js';

/**
 * Ejercita el singleton real del módulo, en el orden en que ocurriría en
 * un proceso recién levantado: primero sin dato, después con `cuota.json`
 * fresco, y por último con un `rate_limit_event` real llegando después del
 * seed. node:test corre los `test()` de un mismo archivo en el orden en que
 * se definen, así que el estado se arrastra a propósito de uno al siguiente
 * — igual que en el proceso real, donde `state` también es un singleton.
 */

function readingFresco(now: number): CuotaFileReading {
  return {
    ts: now - 60_000,
    fiveHour: { porcentaje: 42, resetsAt: now + 3_600_000, leidoEn: now - 60_000 },
    sevenDay: { porcentaje: 71, resetsAt: now + 86_400_000, leidoEn: now - 60_000 },
  };
}

test('getUsageWindow sin cuota.json (proceso recién levantado) devuelve null, no inventa nada', async () => {
  const snapshot = await getUsageWindow({ leerCuotaFile: () => null, ahora: () => Date.now() });

  assert.equal(snapshot.fiveHour, null);
  assert.equal(snapshot.sevenDay, null);
});

test('getUsageWindow con cuota.json viejo (más de REAL_DATA_STALE_MS) sigue devolviendo null', async () => {
  const now = Date.now();
  const reading = readingFresco(now);
  reading.ts = now - 16 * 60 * 1000; // 16 min, por encima del techo de 15

  const snapshot = await getUsageWindow({ leerCuotaFile: () => reading, ahora: () => now });

  assert.equal(snapshot.fiveHour, null);
  assert.equal(snapshot.sevenDay, null);
});

test('getUsageWindow con cuota.json fresco siembra el snapshot sin esperar un rate_limit_event', async () => {
  const now = Date.now();

  const snapshot = await getUsageWindow({ leerCuotaFile: () => readingFresco(now), ahora: () => now });

  assert.equal(snapshot.fiveHour?.porcentaje, 42);
  assert.equal(snapshot.sevenDay?.porcentaje, 71);
});

test('un rate_limit_event real posterior sigue pisando el valor sembrado', () => {
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
