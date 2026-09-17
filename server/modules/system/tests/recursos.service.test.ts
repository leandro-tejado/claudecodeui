import assert from 'node:assert/strict';
import test from 'node:test';

import { RAM_CEILING_PERCENT } from '../services/ram-ceiling.service.js';
import { contarSesionesTmuxVivas, medirDiscoDesdeStats, recursosService } from '../services/recursos.service.js';

function meminfo(totalKb: number, availableKb: number): string {
  return `MemTotal:       ${totalKb} kB\nMemFree:        1000 kB\nMemAvailable:   ${availableKb} kB\n`;
}

test('medirDiscoDesdeStats calcula % y GB crudos a partir de bloques', () => {
  // 100 GiB totales, 19 GiB usados.
  const bsize = 4096;
  const totalBytes = 100 * 1024 ** 3;
  const usadoBytes = 19 * 1024 ** 3;
  const blocks = totalBytes / bsize;
  const bfree = (totalBytes - usadoBytes) / bsize;

  const medicion = medirDiscoDesdeStats({ bsize, blocks, bfree });

  assert.ok(medicion.usadoPct !== null && Math.abs(medicion.usadoPct - 19) < 0.01);
  assert.ok(medicion.usadoGb !== null && Math.abs(medicion.usadoGb - 19) < 0.01);
  assert.ok(medicion.totalGb !== null && Math.abs(medicion.totalGb - 100) < 0.01);
});

test('medirDiscoDesdeStats sin stats (statfs tiró) no inventa un 0%', () => {
  const medicion = medirDiscoDesdeStats(null);
  assert.deepEqual(medicion, { usadoPct: null, usadoGb: null, totalGb: null });
});

test('contarSesionesTmuxVivas cuenta solo las estado viva', () => {
  const registro = JSON.stringify({
    'cloudcli-a': { nombre: 'cloudcli-a', estado: 'viva' },
    'cloudcli-b': { nombre: 'cloudcli-b', estado: 'caida' },
    'cloudcli-c': { nombre: 'cloudcli-c', estado: 'viva' },
  });

  assert.equal(contarSesionesTmuxVivas(registro), 2);
});

test('contarSesionesTmuxVivas sin registro (JSON inválido) da 0, no tira', () => {
  assert.equal(contarSesionesTmuxVivas('esto no es json'), 0);
});

test('recursosService.medir junta las tres fuentes y agrega el techo del gobernador', () => {
  const snapshot = recursosService.medir({
    leerMeminfo: () => meminfo(10_000, 5_000), // 50% usada
    leerDisco: () => ({ bsize: 4096, blocks: 1000, bfree: 190 }), // 81% usado
    leerRegistroSesiones: () => JSON.stringify({ a: { estado: 'viva' }, b: { estado: 'viva' } }),
  });

  assert.equal(snapshot.kind, 'recursos');
  assert.equal(snapshot.ram.porcentajePct, 50);
  assert.ok(snapshot.disco.usadoPct !== null && snapshot.disco.usadoPct > 80);
  assert.equal(snapshot.sesionesTmux, 2);
  assert.equal(snapshot.techoRam, RAM_CEILING_PERCENT);
});

test('recursosService.medir no se cae si una fuente tira: las otras dos siguen', () => {
  const snapshot = recursosService.medir({
    leerMeminfo: () => {
      throw new Error('no hay /proc/meminfo en esta plataforma');
    },
    leerDisco: () => ({ bsize: 4096, blocks: 1000, bfree: 190 }),
    leerRegistroSesiones: () => {
      throw new Error('no existe todavía (Fase 1 sin correr)');
    },
  });

  assert.deepEqual(snapshot.ram, { porcentajePct: null, usadaGb: null, totalGb: null });
  assert.ok(snapshot.disco.usadoPct !== null);
  assert.equal(snapshot.sesionesTmux, 0);
  assert.equal(snapshot.techoRam, RAM_CEILING_PERCENT);
});
