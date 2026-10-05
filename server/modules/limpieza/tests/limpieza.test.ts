import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, getConnection, initializeDatabase, projectsDb, sessionsDb } from '@/modules/database/index.js';

import { ejecutarLimpieza } from '../services/ejecucion.service.js';
import type { DependenciasLimpieza, LineaLimpieza } from '../services/ejecucion.service.js';
import { leerRegistroTmux } from '../services/entradas.service.js';
import { correrLimpieza } from '../services/limpieza.service.js';
import {
  proyectoDeCwd,
  seleccionarLimpieza,
} from '../services/seleccion.service.js';
import type { ProyectoLimpieza, SesionLimpieza, TmuxViva } from '../services/seleccion.service.js';

/**
 * Fase 5 de `05-octubre-limpieza-barra-viva.md`. La selección es pura, así que
 * casi todo se prueba con datos armados a mano; la ejecución recibe sus
 * dependencias (dormir, archivar, log) y nunca llama a `orquestar.py` de verdad.
 */

const HORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;
const AHORA = Date.parse('2026-10-05T12:00:00Z');

let contador = 0;
function proyecto(ruta: string, extra: Partial<ProyectoLimpieza> = {}): ProyectoLimpieza {
  contador += 1;
  return { projectId: `p-${contador}`, projectPath: ruta, isStarred: false, archivado: false, ...extra };
}

function sesion(id: string, ruta: string | null, haceHoras: number, extra: Partial<SesionLimpieza> = {}): SesionLimpieza {
  return { sessionId: id, projectPath: ruta, entrypoint: 'cli', updatedAtMs: AHORA - haceHoras * HORA, jsonlMtimeMs: null, ...extra };
}

const idsCandidatos = (plan: ReturnType<typeof seleccionarLimpieza>) => plan.proyectos.map((p) => p.projectPath).sort();

test('tope de 3 con 5 proyectos activos: los 2 más viejos se archivan aunque tengan menos de 72 h', () => {
  const rutas = ['/w/a', '/w/b', '/w/c', '/w/d', '/w/e'];
  const proyectos = rutas.map((r) => proyecto(r));
  const sesiones = rutas.map((r, i) => sesion(`s-${i}`, r, i + 1));
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  assert.deepEqual(idsCandidatos(plan), ['/w/d', '/w/e']);
  assert.deepEqual(plan.exentos.map((e) => [e.projectPath, e.motivo]).sort(), [
    ['/w/a', 'tope'],
    ['/w/b', 'tope'],
    ['/w/c', 'tope'],
  ]);
  assert.deepEqual(plan.sesiones, [], 'archivar el proyecto no archiva sus sesiones recientes');
});

test('tope de 3 con 0 activos: los 3 más recientes quedan aunque lleven más de 72 h', () => {
  const rutas = ['/w/a', '/w/b', '/w/c', '/w/d', '/w/e'];
  const proyectos = rutas.map((r) => proyecto(r));
  // Todos con más de 72 h; el orden de actividad es a > b > c > d > e.
  const sesiones = rutas.map((r, i) => sesion(`s-${i}`, r, 100 + i * 10));
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  assert.deepEqual(idsCandidatos(plan), ['/w/d', '/w/e']);
  assert.deepEqual(plan.exentos.map((e) => [e.projectPath, e.motivo]).sort(), [
    ['/w/a', 'tope'],
    ['/w/b', 'tope'],
    ['/w/c', 'tope'],
  ]);
});

test('con menos proyectos que el tope no se archiva ninguno', () => {
  const proyectos = [proyecto('/w/a'), proyecto('/w/b')];
  const plan = seleccionarLimpieza(AHORA, proyectos, [sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 200)], []);
  assert.deepEqual(plan.proyectos, []);
});

test('un proyecto fijado se suma al tope: no ocupa uno de los 3 lugares', () => {
  const proyectos = [
    proyecto('/w/a'), proyecto('/w/b'), proyecto('/w/c'), proyecto('/w/d'),
    proyecto('/w/fijado', { isStarred: true }),
  ];
  const sesiones = [
    sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2), sesion('s-c', '/w/c', 3), sesion('s-d', '/w/d', 4),
    // El fijado es el más reciente de todos y aun así no desplaza a ninguno.
    sesion('s-f', '/w/fijado', 0.5),
  ];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  assert.deepEqual(idsCandidatos(plan), ['/w/d']);
  assert.equal(plan.exentos.find((e) => e.projectPath === '/w/fijado')?.motivo, 'fijado');
});

test('un proyecto fijado inactivo se queda y no cuenta para el tope', () => {
  const proyectos = [proyecto('/w/a'), proyecto('/w/b'), proyecto('/w/c'), proyecto('/w/fijado', { isStarred: true })];
  const sesiones = [
    sesion('s-a', '/w/a', 80), sesion('s-b', '/w/b', 81), sesion('s-c', '/w/c', 82),
    sesion('s-f', '/w/fijado', 500),
  ];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  assert.deepEqual(plan.proyectos, []);
  assert.deepEqual(plan.exentos.find((e) => e.projectPath === '/w/fijado')?.motivo, 'fijado');
});

test('la sesión fija exime a su proyecto y nunca se archiva', () => {
  const proyectos = [proyecto('/w/a'), proyecto('/w/b'), proyecto('/w/c'), proyecto('/w/workspace')];
  const sesiones = [
    sesion('s-a', '/w/a', 80), sesion('s-b', '/w/b', 81), sesion('s-c', '/w/c', 82),
    sesion('s-fija', '/w/workspace', 500),
    sesion('s-vieja', '/w/a', 900),
  ];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, [], { sessionId: 's-fija', cwd: '/w/workspace' });
  assert.deepEqual(plan.proyectos, []);
  assert.equal(plan.exentos.find((e) => e.projectPath === '/w/workspace')?.motivo, 'sesion-fija');
  assert.ok(!plan.sesiones.some((s) => s.sessionId === 's-fija'), 'la fija no se archiva');
  assert.ok(plan.sesiones.some((s) => s.sessionId === 's-vieja'), 'las demás inactivas sí');

  // Aunque su proyecto no se sepa por el cwd, la fila de la propia sesión alcanza.
  const porFila = seleccionarLimpieza(AHORA, proyectos, sesiones, [], { sessionId: 's-fija', cwd: null });
  assert.equal(porFila.exentos.find((e) => e.projectPath === '/w/workspace')?.motivo, 'sesion-fija');
});

test('una headless terminada se archiva y una que sigue escribiendo no', () => {
  const proyectos = [proyecto('/w/a')];
  const sesiones = [
    sesion('s-terminada', '/w/a', 1, { entrypoint: 'sdk-cli', jsonlMtimeMs: AHORA - 10 * MINUTO }),
    sesion('s-corriendo', '/w/a', 1, { entrypoint: 'sdk-cli', jsonlMtimeMs: AHORA - 9 * MINUTO }),
    sesion('s-interactiva', '/w/a', 1),
  ];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  assert.deepEqual(plan.sesiones, [{ sessionId: 's-terminada', projectPath: '/w/a', motivo: 'headless-terminada' }]);
});

test('una headless con tmux vivo no se archiva aunque su .jsonl esté quieto', () => {
  const sesiones = [sesion('s-h', '/w/a', 1, { entrypoint: 'sdk-cli', jsonlMtimeMs: AHORA - HORA })];
  const tmux: TmuxViva[] = [{ nombre: 'x', sessionId: 's-h', cwd: '/w/a' }];
  assert.deepEqual(seleccionarLimpieza(AHORA, [proyecto('/w/a')], sesiones, tmux).sesiones, []);
});

test('las headless no mantienen vivo un proyecto, y un entrypoint NULL cuenta como interactivo', () => {
  const rutas = ['/w/a', '/w/b', '/w/c', '/w/solo-headless', '/w/sin-dato'];
  const proyectos = rutas.map((r) => proyecto(r));
  const sesiones = [
    sesion('s-a', '/w/a', 80), sesion('s-b', '/w/b', 81), sesion('s-c', '/w/c', 82),
    // Reciente, pero headless: no cuenta como actividad.
    sesion('s-h', '/w/solo-headless', 0.1, { entrypoint: 'sdk-cli', jsonlMtimeMs: AHORA - 1 * MINUTO }),
    // Sin entrypoint y reciente: es actividad, el proyecto no es candidato.
    sesion('s-n', '/w/sin-dato', 1, { entrypoint: null }),
  ];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  // sin-dato (1 h) entra al tope junto con a y b; c y solo-headless quedan afuera.
  assert.deepEqual(idsCandidatos(plan), ['/w/c', '/w/solo-headless']);
  assert.equal(plan.proyectos.find((p) => p.projectPath === '/w/solo-headless')?.ultimaActividad, null);
  assert.ok(!plan.proyectos.some((p) => p.projectPath === '/w/sin-dato'));
});

test('un proyecto sin sesiones se archiva y no ocupa un lugar del tope', () => {
  const proyectos = [proyecto('/w/a'), proyecto('/w/b'), proyecto('/w/vacio')];
  const sesiones = [sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2)];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, []);
  assert.deepEqual(idsCandidatos(plan), ['/w/vacio']);
  assert.equal(plan.proyectos[0].ultimaActividad, null);
});

test('una sesión inactiva sin tmux se archiva, y con tmux vivo se queda', () => {
  const proyectos = [proyecto('/w/a')];
  const sesiones = [
    sesion('s-nueva', '/w/a', 1),
    sesion('s-vieja', '/w/a', 73),
    sesion('s-vieja-con-tmux', '/w/a', 200),
    sesion('s-en-el-limite', '/w/a', 72),
  ];
  const tmux: TmuxViva[] = [{ nombre: 'conectada', sessionId: 's-vieja-con-tmux', cwd: '/w/a' }];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, tmux);
  assert.deepEqual(plan.sesiones.map((s) => s.sessionId).sort(), ['s-en-el-limite', 's-vieja']);
});

test('el cwd se asigna al proyecto con el prefijo más largo, con separador de directorio', () => {
  const grande = proyecto('/w/workspace');
  const anidado = proyecto('/w/workspace/clientes/app');
  const parecido = proyecto('/w/app-viejo');
  const lista = [grande, anidado, parecido];
  assert.equal(proyectoDeCwd('/w/workspace/clientes/app/src', lista)?.projectPath, '/w/workspace/clientes/app');
  assert.equal(proyectoDeCwd('/w/workspace/otro', lista)?.projectPath, '/w/workspace');
  assert.equal(proyectoDeCwd('/w/app-viejo-2', lista), null, 'un prefijo de string crudo no cuenta');
  assert.equal(proyectoDeCwd('/fuera/de/todo', lista), null);
  assert.equal(proyectoDeCwd(null, lista), null);
});

test('un candidato lista sus sesiones de tmux; las de un worktree fuera del proyecto o de un archivado no', () => {
  const candidato = proyecto('/w/viejo');
  const archivado = proyecto('/w/viejo/sub', { archivado: true });
  const resto = ['/w/a', '/w/b', '/w/c'].map((r) => proyecto(r));
  const sesiones = [sesion('s-v', '/w/viejo', 300), sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2), sesion('s-c', '/w/c', 3)];
  const tmux: TmuxViva[] = [
    { nombre: 'dentro', sessionId: null, cwd: '/w/viejo/src' },
    { nombre: 'en-archivado', sessionId: null, cwd: '/w/viejo/sub/x' },
    { nombre: 'worktree', sessionId: null, cwd: '/home/wt/viejo' },
    { nombre: 'web', sessionId: null, cwd: '/w/viejo' },
  ];
  const plan = seleccionarLimpieza(AHORA, [candidato, archivado, ...resto], sesiones, tmux);
  assert.deepEqual(plan.proyectos[0].tmux, [
    { nombre: 'dentro', protegida: false },
    { nombre: 'web', protegida: true },
  ]);
});

function dependenciasEspia(dormirResultado: (nombre: string) => { ok: boolean; motivo?: string } = () => ({ ok: true })) {
  const llamadas = { dormir: [] as string[], proyectos: [] as string[], sesiones: [] as string[], anuncios: [] as Array<{ projectIds: string[]; sessionIds: string[] }>, logs: [] as LineaLimpieza[] };
  const deps: DependenciasLimpieza = {
    dormir: async (nombre) => { llamadas.dormir.push(nombre); return dormirResultado(nombre); },
    archivarProyecto: (id) => { llamadas.proyectos.push(id); },
    archivarSesion: (id) => { llamadas.sesiones.push(id); },
    anunciar: (ids) => { llamadas.anuncios.push(ids); },
    escribirLog: async (linea) => { llamadas.logs.push(linea); },
    ahora: () => AHORA,
  };
  return { deps, llamadas };
}

function escenarioCandidato() {
  const viejo = proyecto('/w/viejo');
  const proyectos = [viejo, ...['/w/a', '/w/b', '/w/c'].map((r) => proyecto(r))];
  const sesiones = [
    sesion('s-v', '/w/viejo', 300), sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2), sesion('s-c', '/w/c', 3),
    sesion('s-hl', '/w/viejo', 1, { entrypoint: 'sdk-cli', jsonlMtimeMs: AHORA - HORA }),
  ];
  const tmux: TmuxViva[] = [
    { nombre: 'viejo-ejecutora-1', sessionId: null, cwd: '/w/viejo' },
    { nombre: 'viejo-guia-1', sessionId: null, cwd: '/w/viejo/docs' },
  ];
  return { viejo, plan: seleccionarLimpieza(AHORA, proyectos, sesiones, tmux) };
}

test('un dormir que falla bloquea el archivado del proyecto y deja el motivo en el log', async () => {
  const { viejo, plan } = escenarioCandidato();
  const { deps, llamadas } = dependenciasEspia((nombre) =>
    nombre === 'viejo-guia-1' ? { ok: false, motivo: 'cambios sin commitear' } : { ok: true });
  const linea = await ejecutarLimpieza(plan, 'ejecutar', deps);

  assert.deepEqual(llamadas.dormir, ['viejo-ejecutora-1', 'viejo-guia-1']);
  assert.deepEqual(llamadas.proyectos, [], 'el proyecto no se archiva');
  assert.deepEqual(linea.bloqueados, [{ proyecto: '/w/viejo', sesion: 'viejo-guia-1', motivo: 'cambios sin commitear' }]);
  assert.deepEqual(linea.dormidas, ['viejo-ejecutora-1']);
  // La headless terminada se archiva igual; la interactiva vieja se queda con el proyecto.
  assert.deepEqual(llamadas.sesiones, ['s-hl']);
  assert.deepEqual(llamadas.anuncios, [{ projectIds: [], sessionIds: ['s-hl'] }]);
  assert.equal(viejo.projectPath, '/w/viejo');
});

test('un dormir que lanza o se cuelga cuenta como rechazo', async () => {
  const { plan } = escenarioCandidato();
  const { deps, llamadas } = dependenciasEspia();
  deps.dormir = async () => { throw new Error('timeout de 20 s'); };
  const linea = await ejecutarLimpieza(plan, 'ejecutar', deps);
  assert.deepEqual(llamadas.proyectos, []);
  assert.equal(linea.bloqueados[0].motivo, 'timeout de 20 s');
});

test('web y orquestador nunca llegan a dormir: bloquean el proyecto', async () => {
  const candidato = proyecto('/w/viejo');
  const resto = ['/w/a', '/w/b', '/w/c'].map((r) => proyecto(r));
  const sesiones = [sesion('s-v', '/w/viejo', 300), sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2), sesion('s-c', '/w/c', 3)];
  const tmux: TmuxViva[] = [
    { nombre: 'orquestador', sessionId: null, cwd: '/w/viejo' },
    { nombre: 'web', sessionId: null, cwd: '/w/viejo' },
  ];
  const plan = seleccionarLimpieza(AHORA, [candidato, ...resto], sesiones, tmux);
  const { deps, llamadas } = dependenciasEspia();
  const linea = await ejecutarLimpieza(plan, 'ejecutar', deps);
  assert.deepEqual(llamadas.dormir, []);
  assert.deepEqual(llamadas.proyectos, []);
  assert.equal(linea.bloqueados.length, 1);
  assert.equal(linea.bloqueados[0].sesion, 'orquestador');
});

test('un proyecto reciente fuera del tope con una tmux que no duerme se queda y el log lo avisa', async () => {
  const proyectos = ['/w/a', '/w/b', '/w/c', '/w/cuarto'].map((r) => proyecto(r));
  const sesiones = [sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2), sesion('s-c', '/w/c', 3), sesion('s-4', '/w/cuarto', 5)];
  const tmux: TmuxViva[] = [{ nombre: 'cuarto-ejecutora-1', sessionId: null, cwd: '/w/cuarto' }];
  const plan = seleccionarLimpieza(AHORA, proyectos, sesiones, tmux);
  assert.deepEqual(idsCandidatos(plan), ['/w/cuarto']);
  const { deps, llamadas } = dependenciasEspia(() => ({ ok: false, motivo: 'pregunta pendiente' }));
  const linea = await ejecutarLimpieza(plan, 'ejecutar', deps);
  assert.deepEqual(llamadas.proyectos, []);
  assert.deepEqual(linea.bloqueados, [{ proyecto: '/w/cuarto', sesion: 'cuarto-ejecutora-1', motivo: 'pregunta pendiente' }]);
  assert.equal(linea.resumen.bloqueados, 1);
});

test('si todas duermen se archiva el proyecto con un solo evento sidebar_archived', async () => {
  const { viejo, plan } = escenarioCandidato();
  const { deps, llamadas } = dependenciasEspia();
  const linea = await ejecutarLimpieza(plan, 'ejecutar', deps);
  assert.deepEqual(llamadas.dormir, ['viejo-ejecutora-1', 'viejo-guia-1']);
  assert.deepEqual(llamadas.proyectos, [viejo.projectId]);
  assert.equal(llamadas.anuncios.length, 1);
  assert.deepEqual(llamadas.anuncios[0].projectIds, [viejo.projectId]);
  assert.deepEqual(linea.bloqueados, []);
  assert.equal(llamadas.logs.length, 1);
});

test('simular loguea el plan entero y no toca nada', async () => {
  const { viejo, plan } = escenarioCandidato();
  const { deps, llamadas } = dependenciasEspia();
  const linea = await ejecutarLimpieza(plan, 'simular', deps);
  assert.deepEqual(llamadas.dormir, []);
  assert.deepEqual(llamadas.proyectos, []);
  assert.deepEqual(llamadas.sesiones, []);
  assert.deepEqual(llamadas.anuncios, []);
  assert.equal(llamadas.logs.length, 1, 'la línea del log sí sale');
  assert.equal(linea.modo, 'simular');
  assert.deepEqual(linea.dormidas, ['viejo-ejecutora-1', 'viejo-guia-1']);
  assert.deepEqual(linea.archivados.proyectos, [{ projectId: viejo.projectId, projectPath: '/w/viejo' }]);
  assert.deepEqual(linea.resumen, { proyectos: 1, sesiones: 0, dormidas: 2, bloqueados: 0, exentos: 3 });
});

test('dos corridas a la vez no se pisan: la segunda se descarta', async () => {
  const entradas = () => {
    const { plan } = escenarioCandidato();
    void plan;
    return {
      proyectos: [proyecto('/w/viejo'), ...['/w/a', '/w/b', '/w/c'].map((r) => proyecto(r))],
      sesiones: [sesion('s-v', '/w/viejo', 300), sesion('s-a', '/w/a', 1), sesion('s-b', '/w/b', 2), sesion('s-c', '/w/c', 3)],
      tmuxVivas: [{ nombre: 'viejo-ejecutora-1', sessionId: null, cwd: '/w/viejo' }] as TmuxViva[],
      fija: null,
    };
  };
  let liberar: () => void = () => {};
  const { deps, llamadas } = dependenciasEspia();
  deps.dormir = (nombre) => new Promise((resolve) => { llamadas.dormir.push(nombre); liberar = () => resolve({ ok: true }); });

  const primera = correrLimpieza({ modo: 'ejecutar', leerEntradas: entradas, dependencias: deps });
  await new Promise((r) => setImmediate(r));
  const segunda = await correrLimpieza({ modo: 'ejecutar', leerEntradas: entradas, dependencias: deps });
  assert.equal(segunda, null, 'mientras hay una corrida en curso, la otra no arranca');

  liberar();
  const resultado = await primera;
  assert.equal(resultado?.archivados.proyectos.length, 1);
  assert.deepEqual(llamadas.dormir, ['viejo-ejecutora-1'], 'dormir se llamó una sola vez');

  // Terminada la primera, el flag se libera.
  const tercera = await correrLimpieza({ modo: 'simular', leerEntradas: entradas, dependencias: deps });
  assert.notEqual(tercera, null);
});

test('el registro de tmux: viva, fija y ruta por AOS_SESIONES_REGISTRO_PATH', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'limpieza-registro-'));
  const previa = process.env.AOS_SESIONES_REGISTRO_PATH;
  try {
    const ruta = path.join(dir, 'sesiones.json');
    process.env.AOS_SESIONES_REGISTRO_PATH = ruta;
    await writeFile(ruta, JSON.stringify({
      orquestador: { nombre: 'orquestador', cwd: '/w/workspace', session_id: 'sid-fija', estado: 'caida', fija: true },
      uno: { nombre: 'uno', cwd: '/w/a', session_id: 'sid-1', estado: 'viva' },
      dos: { nombre: 'dos', cwd: '/w/b', session_id: null, estado: 'caida' },
    }));
    const { tmuxVivas, fija } = leerRegistroTmux();
    assert.deepEqual(tmuxVivas, [{ nombre: 'uno', sessionId: 'sid-1', cwd: '/w/a' }]);
    assert.deepEqual(fija, { sessionId: 'sid-fija', cwd: '/w/workspace' });

    // Ausente: no hay sesiones. A medio escribir: lanza, no se asume vacío.
    await rm(ruta);
    assert.deepEqual(leerRegistroTmux(), { tmuxVivas: [], fija: null });
    await writeFile(ruta, '{"uno": ');
    assert.throws(() => leerRegistroTmux());
  } finally {
    if (previa === undefined) delete process.env.AOS_SESIONES_REGISTRO_PATH;
    else process.env.AOS_SESIONES_REGISTRO_PATH = previa;
    await rm(dir, { recursive: true, force: true });
  }
});

test('contra una DB real: simular escribe una línea y no cambia nada; ejecutar archiva con archived_by auto', async () => {
  const previaDb = process.env.DATABASE_PATH;
  const previaLog = process.env.LIMPIEZA_LOG_PATH;
  const previoRegistro = process.env.AOS_SESIONES_REGISTRO_PATH;
  const dir = await mkdtemp(path.join(tmpdir(), 'limpieza-db-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(dir, 'auth.db');
  process.env.LIMPIEZA_LOG_PATH = path.join(dir, 'log', 'limpieza.jsonl');
  process.env.AOS_SESIONES_REGISTRO_PATH = path.join(dir, 'sesiones.json');
  try {
    await initializeDatabase();
    await writeFile(process.env.AOS_SESIONES_REGISTRO_PATH, '{}');
    for (const ruta of ['/w/viejo', '/w/a', '/w/b', '/w/c']) projectsDb.createProjectPath(ruta);
    sessionsDb.createSession('s-viejo', 'claude', '/w/viejo', 'Vieja');
    for (const [id, ruta] of [['s-a', '/w/a'], ['s-b', '/w/b'], ['s-c', '/w/c']]) sessionsDb.createSession(id, 'claude', ruta, id);
    const db = getConnection();
    db.prepare("UPDATE sessions SET updated_at = '2026-06-01 00:00:00' WHERE session_id = 's-viejo'").run();
    const contar = () => db.prepare('SELECT (SELECT COUNT(*) FROM projects WHERE isArchived = 1) AS p, (SELECT COUNT(*) FROM sessions WHERE isArchived = 1) AS s').get();
    const ahora = () => Date.now();

    const simulada = await correrLimpieza({ modo: 'simular', dependencias: { ahora } });
    assert.equal(simulada?.archivados.proyectos.length, 1, 'el plan incluye el proyecto viejo');
    assert.deepEqual(contar(), { p: 0, s: 0 }, 'simular no cambia la DB');
    const lineas = (await readFile(process.env.LIMPIEZA_LOG_PATH, 'utf8')).trim().split('\n');
    assert.equal(lineas.length, 1);
    assert.equal(JSON.parse(lineas[0]).modo, 'simular');

    const ejecutada = await correrLimpieza({ modo: 'ejecutar', dependencias: { ahora } });
    assert.equal(ejecutada?.archivados.proyectos.length, 1);
    assert.deepEqual(contar(), { p: 1, s: 0 });
    const fila = projectsDb.getProjectPath('/w/viejo');
    assert.equal(fila?.isArchived, 1);
    assert.equal(fila?.archived_by, 'auto');
    assert.ok(fila?.archived_at);
    assert.equal((await readFile(process.env.LIMPIEZA_LOG_PATH, 'utf8')).trim().split('\n').length, 2);
  } finally {
    closeConnection();
    for (const [clave, valor] of [['DATABASE_PATH', previaDb], ['LIMPIEZA_LOG_PATH', previaLog], ['AOS_SESIONES_REGISTRO_PATH', previoRegistro]] as const) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
