import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  _resetPaneVivoParaTests,
  extraerBorrador,
  leerActividadPane,
  messageIdBorrador,
  suscribirPaneVivo,
  ultimaActividadConocida,
  type EventoPaneVivo,
} from '@/modules/websocket/services/tmux-pane-vivo.service.js';

/*
 * Fixtures: 6 capturas reales (`tmux capture-pane -p -e`, con sus escapes de
 * color) de una sesión `claude --version` 2.1.289 de verdad, tomadas el
 * 6-oct-2026 vía `orquestar.py` (ver e2e/fixtures/panes/2.1.289/). No son
 * texto escrito a mano: son lo que la terminal mostró en cada uno de los 6
 * estados que pide el Paso 4 de la Fase 7.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', 'e2e', 'fixtures', 'panes', '2.1.289');

function fixture(nombre: string): string {
  return readFileSync(path.join(FIXTURES_DIR, `${nombre}.txt`), 'utf8');
}

test('leerActividadPane: "pensando" es thinking, con el texto del spinner', () => {
  const actividad = leerActividadPane(fixture('pensando'));
  assert.equal(actividad?.kind, 'thinking');
  assert.match((actividad as { texto: string }).texto, /…/);
});

test('leerActividadPane: "tool" es tool, con el nombre de la tool en curso', () => {
  const actividad = leerActividadPane(fixture('tool'));
  assert.equal(actividad?.kind, 'tool');
  assert.match((actividad as { name: string }).name, /Running 1 shell command/i);
});

test('leerActividadPane: "escribiendo" tiene actividad (no idle, no null)', () => {
  const actividad = leerActividadPane(fixture('escribiendo'));
  assert.ok(actividad);
  assert.notEqual(actividad?.kind, 'idle');
});

test('leerActividadPane: "dialogo" no se opina (null) — hay un AskUserQuestion abierto', () => {
  assert.equal(leerActividadPane(fixture('dialogo')), null);
});

test('leerActividadPane: "libre" es idle — el resumen en pasado no es spinner', () => {
  assert.deepEqual(leerActividadPane(fixture('libre')), { kind: 'idle' });
});

test('leerActividadPane: "sugerencia-gris" es idle — la sugerencia atenuada no es un cuadro con texto', () => {
  assert.deepEqual(leerActividadPane(fixture('sugerencia-gris')), { kind: 'idle' });
});

test('extraerBorrador: "escribiendo" devuelve el texto de la respuesta en curso, sin líneas de contabilidad', () => {
  const borrador = extraerBorrador(fixture('escribiendo'));
  assert.ok(borrador);
  assert.match(borrador as string, /tide unrolls its silver thread/i);
  assert.doesNotMatch(borrador as string, /Ran \d+ shell command/i);
  assert.doesNotMatch(borrador as string, /Running 1 shell command/i);
  assert.doesNotMatch(borrador as string, /ctx \d+%/i);
});

test('extraerBorrador: "dialogo" no tiene borrador (null)', () => {
  assert.equal(extraerBorrador(fixture('dialogo')), null);
});

test('extraerBorrador: "libre" no tiene borrador — no hay turno en curso', () => {
  assert.equal(extraerBorrador(fixture('libre')), null);
});

test('messageIdBorrador: estable por sesión', () => {
  assert.equal(messageIdBorrador('abc'), messageIdBorrador('abc'));
  assert.notEqual(messageIdBorrador('abc'), messageIdBorrador('def'));
});

test('suscribirPaneVivo: emite activity al pasar de idle a thinking, y lo recuerda en ultimaActividadConocida', async () => {
  _resetPaneVivoParaTests();
  const eventos: EventoPaneVivo[] = [];
  let pantalla = fixture('libre');
  const baja = suscribirPaneVivo(
    { soyUnTokenDePrueba: true },
    'prov-1',
    'sesion-de-mentira',
    'session-1',
    (evento) => eventos.push(evento),
    { capturarPantalla: async () => pantalla },
  );
  try {
    // Primer tick: arranca en 'idle' (estado inicial) y la pantalla también
    // es 'libre' -> no hay transición, no emite 'activity' de idle.
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(eventos.length, 0);
    assert.deepEqual(ultimaActividadConocida('prov-1'), { kind: 'idle' });

    // Pasa a "pensando": debe emitir un evento 'activity' de tipo thinking.
    pantalla = fixture('pensando');
    await new Promise((r) => setTimeout(r, 450));
    const deThinking = eventos.find((e) => e.kind === 'activity' && e.activityKind === 'thinking');
    assert.ok(deThinking, 'se esperaba un evento activity de thinking');
    assert.equal(ultimaActividadConocida('prov-1')?.kind, 'thinking');

    // Vuelve a "libre": debe emitir el activity de idle (transición busy->idle).
    eventos.length = 0;
    pantalla = fixture('libre');
    await new Promise((r) => setTimeout(r, 450));
    const deIdle = eventos.find((e) => e.kind === 'activity' && e.activityKind === undefined);
    assert.ok(deIdle, 'se esperaba un evento activity idle al volver a libre');
  } finally {
    baja();
    _resetPaneVivoParaTests();
  }
});

test('suscribirPaneVivo: dos suscriptores de la misma sesion comparten un solo poll, y se apaga solo cuando se van los dos', () => {
  _resetPaneVivoParaTests();
  const eventos: EventoPaneVivo[] = [];
  const deps = { capturarPantalla: async () => fixture('libre') };
  const bajaUno = suscribirPaneVivo('token-1', 'prov-2', 'sesion-x', 'session-2', (e) => eventos.push(e), deps);
  const bajaDos = suscribirPaneVivo('token-2', 'prov-2', 'sesion-x', 'session-2', (e) => eventos.push(e), deps);
  // Nadie disparó un tick todavía: null, nunca 'idle' por default (eso fue
  // el bug real de "recarga a mitad de un turno" — ver el comentario en
  // tmux-pane-vivo.service.ts).
  assert.equal(ultimaActividadConocida('prov-2'), null);
  bajaUno();
  // Todavia queda un suscriptor: el estado sigue vivo (aunque sin dato).
  assert.equal(ultimaActividadConocida('prov-2'), null);
  bajaDos();
  // Sin suscriptores: el estado se borra.
  assert.equal(ultimaActividadConocida('prov-2'), null);
  _resetPaneVivoParaTests();
});
