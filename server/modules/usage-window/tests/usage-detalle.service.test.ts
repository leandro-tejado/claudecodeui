import assert from 'node:assert/strict';
import test from 'node:test';

import { usageDetalleService } from '../services/usage-detalle.service.js';

const CRUDO_OK = JSON.stringify({
  ts: 1789618000,
  ventana_inicio: '2026-09-17T03:40:00+00:00',
  ventana_fin: '2026-09-17T08:40:00+00:00',
  usd_total: 3.39,
  llamadas: 49,
  top_sesiones: [
    { sid: 'abc', cwd: '~/workspace-leandro', llamadas: 44, usd: 2.16, pct: 63.87 },
  ],
  pct_subagentes: 0,
  pct_ctx_alto: 63.87,
  por_skill: [{ skill: 'aos-core:ejecutar-plan', usd: 2.16, pct: 63.87 }],
});

test('usageDetalleService.leer parsea el volcado real de consumo.py y lo camelCasea', () => {
  const detalle = usageDetalleService.leer({ leerArchivo: () => CRUDO_OK });

  assert.ok(detalle);
  assert.equal(detalle!.ts, 1789618000);
  assert.equal(detalle!.usdTotal, 3.39);
  assert.equal(detalle!.topSesiones[0]!.sid, 'abc');
  assert.equal(detalle!.pctCtxAlto, 63.87);
  assert.equal(detalle!.porSkill[0]!.skill, 'aos-core:ejecutar-plan');
});

test('usageDetalleService.leer con el archivo ausente (Fase 6 sin correr todavía) da null, no un 0', () => {
  const detalle = usageDetalleService.leer({
    leerArchivo: () => {
      throw new Error('ENOENT: no existe ~/.cache/aos/uso-detalle.json');
    },
  });

  assert.equal(detalle, null);
});

test('usageDetalleService.leer con el volcado en estado de error (sin cuota.json) da null', () => {
  const detalle = usageDetalleService.leer({
    leerArchivo: () => JSON.stringify({ ts: null, error: 'sin cuota.json todavia' }),
  });

  assert.equal(detalle, null);
});

test('usageDetalleService.leer con JSON corrupto da null, no tira', () => {
  const detalle = usageDetalleService.leer({ leerArchivo: () => 'esto no es json' });

  assert.equal(detalle, null);
});
