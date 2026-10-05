#!/usr/bin/env node
// Sesiones descartables del arnés. Regla dura: nada que no empiece con PREFIJO
// se crea, se le escribe ni se cierra desde acá.
//
//   node e2e/sesiones.mjs prueba-teardown   verifica que el teardown no toca nada ajeno
//   node e2e/sesiones.mjs teardown          cierra todas las sesiones e2e-* vivas
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { BIN_AOS, PREFIJO, PROYECTO } from './lib/config.mjs';

const ORQUESTAR = path.join(BIN_AOS, 'orquestar.py');
const GOBERNADOR = path.join(BIN_AOS, 'gobernador.py');

export function exigirPrefijo(nombre) {
  if (typeof nombre !== 'string' || !nombre.startsWith(PREFIJO)) {
    throw new Error(`"${nombre}" no empieza con ${PREFIJO}: el arnés no toca sesiones ajenas`);
  }
  return nombre;
}

export function sesionesTmux() {
  const r = spawnSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
}

export function gobernador() {
  const r = spawnSync('python3', [GOBERNADOR, '--json'], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return { color: 'desconocido', crudo: r.stdout + r.stderr }; }
}

export function exigirGobernadorNoRojo() {
  const g = gobernador();
  if (g.color === 'rojo') throw new Error(`gobernador en rojo (${g.motivo ?? ''}): la suite no crea sesiones`);
  return g;
}

// Crea una sesión como lo hace el orquestador. `base` termina siendo
// `<base>-ejecutora-<n>`, así que base tiene que empezar con el prefijo.
// Con E2E_PREFIJO, los nombres fijos de los escenarios (`e2e-…`) se pasan al prefijo de la corrida.
export function crearTmux(base, dir = PROYECTO) {
  if (PREFIJO !== 'e2e-' && base.startsWith('e2e-')) base = PREFIJO + base.slice(4);
  exigirPrefijo(base);
  exigirGobernadorNoRojo();
  const antes = new Set(sesionesTmux());
  const salida = execFileSync('python3', [ORQUESTAR, 'crear', base, 'ejecutora', dir], { encoding: 'utf8' });
  const nueva = sesionesTmux().find((n) => !antes.has(n) && n.startsWith(base));
  const m = salida.match(/'([^']+)'/);
  const nombre = nueva ?? (m && m[1]);
  return exigirPrefijo(nombre);
}

export function leerPane(nombre) {
  exigirPrefijo(nombre);
  return execFileSync('tmux', ['capture-pane', '-t', `=${nombre}:`, '-p'], { encoding: 'utf8' });
}

// `orquestar.py dormir`: mata el pane (kill-session) y registra el session_id
// para poder revivirla — a diferencia de `cerrarTmux`, no la saca del
// registro de sesiones.json (Fase 8: por eso el server tiene que verificar
// contra tmux de verdad en vez de confiar en ese "viva"). Usada por
// `barra/orquestador` para el punto 4 sin crear una sesión de más.
export function dormirTmux(nombre) {
  exigirPrefijo(nombre);
  const r = spawnSync('python3', [ORQUESTAR, 'dormir', nombre], { encoding: 'utf8' });
  if (sesionesTmux().includes(nombre)) {
    // El invariante de "no dormir con cambios sin commitear" (o similar) la
    // rechazó: no es el camino feliz que mide el escenario, pero tampoco hay
    // que dejar un pane de prueba vivo.
    spawnSync('tmux', ['kill-session', '-t', `=${nombre}`]);
  }
  return { salida: r.stdout + r.stderr, cerrada: !sesionesTmux().includes(nombre) };
}

export function cerrarTmux(nombre) {
  exigirPrefijo(nombre);
  // cerrar con --forzar: el proyecto descartable no tiene nada que perder y
  // un repo "sucio" en la caché no debe dejar sesiones de prueba vivas.
  spawnSync('python3', [ORQUESTAR, 'cerrar', nombre, '--forzar'], { encoding: 'utf8' });
  if (sesionesTmux().includes(nombre)) {
    spawnSync('tmux', ['kill-session', '-t', `=${nombre}`]);
  }
  return !sesionesTmux().includes(nombre);
}

export function teardown() {
  const ajenasAntes = sesionesTmux().filter((n) => !n.startsWith(PREFIJO));
  const nuestras = sesionesTmux().filter((n) => n.startsWith(PREFIJO));
  for (const n of nuestras) cerrarTmux(n);
  const ajenasDespues = sesionesTmux().filter((n) => !n.startsWith(PREFIJO));
  const quedan = sesionesTmux().filter((n) => n.startsWith(PREFIJO));
  const intactas = ajenasAntes.length === ajenasDespues.length
    && ajenasAntes.every((n) => ajenasDespues.includes(n));
  return { cerradas: nuestras, quedan, ajenasIntactas: intactas, ajenas: ajenasDespues.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'teardown') {
    console.log(JSON.stringify(teardown(), null, 2));
  } else if (cmd === 'prueba-teardown') {
    let rechazo = false;
    try { exigirPrefijo('web'); } catch { rechazo = true; }
    const nombre = crearTmux('e2e-teardown');
    const creada = sesionesTmux().includes(nombre);
    const r = teardown();
    const ok = rechazo && creada && r.quedan.length === 0 && r.ajenasIntactas;
    console.log(JSON.stringify({ ok, rechazaSinPrefijo: rechazo, creada: nombre, ...r }, null, 2));
    process.exit(ok ? 0 : 1);
  } else {
    console.error('uso: sesiones.mjs teardown|prueba-teardown');
    process.exit(64);
  }
}
