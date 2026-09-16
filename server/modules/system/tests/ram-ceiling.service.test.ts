import assert from 'node:assert/strict';
import test from 'node:test';

import { calcularPorcentajeRamUsada, RAM_CEILING_PERCENT, ramCeilingService } from '../services/ram-ceiling.service.js';

function meminfo(totalKb: number, availableKb: number): string {
  return `MemTotal:       ${totalKb} kB\nMemFree:        1000 kB\nMemAvailable:   ${availableKb} kB\n`;
}

test('calcula el % de RAM usada a partir de MemTotal y MemAvailable', () => {
  const pct = calcularPorcentajeRamUsada(meminfo(10_000, 1_000));
  assert.equal(pct, 90);
});

test('memoria inyectada por debajo del techo no bloquea', () => {
  const resultado = ramCeilingService.estaSobreElTecho({
    leerMeminfo: () => meminfo(10_000, 5_000), // 50% usada
  });
  assert.equal(resultado.sobreElTecho, false);
  assert.equal(resultado.porcentaje, 50);
});

test('memoria inyectada por encima del techo configurado rechaza', () => {
  const disponibleKb = 10_000 * (1 - RAM_CEILING_PERCENT / 100) - 1;
  const resultado = ramCeilingService.estaSobreElTecho({
    leerMeminfo: () => meminfo(10_000, Math.max(0, disponibleKb)),
  });
  assert.equal(resultado.sobreElTecho, true);
  assert.ok((resultado.porcentaje ?? 0) >= RAM_CEILING_PERCENT);
});

test('sin datos de memoria, no bloquea', () => {
  const resultado = ramCeilingService.estaSobreElTecho({
    leerMeminfo: () => {
      throw new Error('no /proc/meminfo en esta plataforma');
    },
  });
  assert.equal(resultado.sobreElTecho, false);
  assert.equal(resultado.porcentaje, null);
});
