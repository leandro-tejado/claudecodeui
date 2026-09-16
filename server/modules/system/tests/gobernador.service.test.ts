import assert from 'node:assert/strict';
import test from 'node:test';

import { calcularPace, gobernadorService, semaforoDesdePace } from '../services/gobernador.service.js';

test('pace con 50% consumido y 25% de ventana transcurrida devuelve 200', () => {
  const ahora = 1_000_000;
  const ventanaTotalSeg = 20_000; // ventana de prueba redonda, no la real de 5h
  const resetsAt = ahora + ventanaTotalSeg * 0.75; // 25% transcurrido
  const pace = calcularPace(50, resetsAt, ahora, ventanaTotalSeg);
  assert.equal(Math.round(pace), 200);
});

test('pace respeta el piso de minutos transcurridos contra la division chica', () => {
  const ahora = 1_000_000;
  const ventanaTotalSeg = 5 * 60 * 60;
  // La ventana recien abrio: sin piso, esto daria un pace absurdo.
  const resetsAt = ahora + ventanaTotalSeg - 1;
  const paceConPiso = calcularPace(2, resetsAt, ahora, ventanaTotalSeg);
  const pctTranscurridoSinPiso = (1 / ventanaTotalSeg) * 100;
  const paceSinPiso = 2 / pctTranscurridoSinPiso * 100;
  assert.ok(paceConPiso < paceSinPiso, 'el piso debe amortiguar el pace fantasma');
});

// Los cinco casos del semaforo (Estado de la Fase 5 del plan).
const CASOS_SEMAFORO: Array<{
  nombre: string;
  pace: number | null;
  consumidoPct: number | null;
  colorEsperado: 'verde' | 'ambar' | 'rojo';
}> = [
  { nombre: 'pace bajo -> verde', pace: 50, consumidoPct: 25, colorEsperado: 'verde' },
  { nombre: 'pace >= 100 -> ambar', pace: 110, consumidoPct: 55, colorEsperado: 'ambar' },
  { nombre: 'pace >= 125 -> rojo', pace: 130, consumidoPct: 60, colorEsperado: 'rojo' },
  { nombre: 'cuota pelada >= 98% -> rojo aunque el pace sea bajo', pace: 10, consumidoPct: 99, colorEsperado: 'rojo' },
  { nombre: 'sin ventana, respaldo 70/90 -> ambar', pace: null, consumidoPct: 80, colorEsperado: 'ambar' },
];

for (const caso of CASOS_SEMAFORO) {
  test(`semaforo: ${caso.nombre}`, () => {
    const { color, motivo } = semaforoDesdePace(caso.pace, caso.consumidoPct);
    assert.equal(color, caso.colorEsperado);
    assert.ok(motivo.length > 0, 'el motivo siempre se devuelve en texto');
  });
}

test('el respaldo sin ventana tambien cubre verde y rojo, no solo ambar', () => {
  assert.equal(semaforoDesdePace(null, 40).color, 'verde');
  assert.equal(semaforoDesdePace(null, 95).color, 'rojo');
});

test('evaluar devuelve las tres claves leyendo cuota.json inyectado', () => {
  const estado = gobernadorService.evaluar({
    ahoraEpochSeg: 1_000_000,
    leerCuota: () => ({ five_hour: 50, five_hour_resets_at: 1_000_000 + 3 * 60 * 60 }),
    leerPanesTmux: () => [],
  });
  assert.ok(['verde', 'ambar', 'rojo'].includes(estado.color));
  assert.equal(typeof estado.pace, 'number');
  assert.ok(estado.motivo.length > 0);
});

test('el aviso nativo de cuota en un capture-pane fuerza rojo sin esperar el pace', () => {
  const estado = gobernadorService.evaluar({
    leerCuota: () => ({ five_hour: 5, five_hour_resets_at: Date.now() / 1000 + 10_000 }),
    leerPanesTmux: () => ['algo de scroll\nClaude usage limit reached · continuing automatically at 3pm\nmas texto'],
  });
  assert.equal(estado.color, 'rojo');
  assert.equal(estado.pace, null);
  assert.match(estado.motivo, /aviso nativo/);
});

test('sin datos de cuota y sin aviso nativo, el gobernador no bloquea', () => {
  const estado = gobernadorService.evaluar({
    leerCuota: () => ({}),
    leerPanesTmux: () => [],
  });
  assert.equal(estado.color, 'verde');
});
