// Sesiones de tmux de prueba creadas como las crea el orquestador, abiertas en la UI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROYECTO, REGISTRO_SESIONES } from './config.mjs';
import { crearTmux } from '../sesiones.mjs';
import { abrirSesion } from './chat.mjs';

const REGISTRO = REGISTRO_SESIONES;
export const TRANSCRIPTS = path.join(os.homedir(), '.claude/projects', PROYECTO.replace(/[^a-zA-Z0-9]/g, '-'));

// `#{session_created}` de la sesión de tmux: es lo que el hook guarda como
// `creada` y lo que distingue esta sesión de otra anterior con el mismo nombre.
function creadaTmux(nombre) {
  try { return Number(execFileSync('tmux', ['display-message', '-p', '-t', `=${nombre}:`, '#{session_created}'], { encoding: 'utf8' }).trim()) || null; } catch { return null; }
}

// Solo vale el sid que escribió el hook de ESTA sesión (o que se leyó de su
// proceso). Contra :3001 el registro real guarda entradas viejas con el mismo
// nombre (`e2e-estado-ejecutora-1` de una corrida anterior, 9-oct): sin
// comparar `creada`, se abría la sesión vieja y el turno iba a la nueva.
export function sidDeRegistro(nombre, creada = creadaTmux(nombre)) {
  try {
    const e = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'))[nombre];
    if (!e?.session_id || creada === null || e.creada !== creada) return null;
    return e.hook_ts || e.sid_fuente === 'proceso' ? e.session_id : null;
  } catch { return null; }
}

// El hook SessionStart escribe el session_id en el registro unos segundos después de crear.
export async function esperarSid(nombre, topeMs = 60_000) {
  const t0 = Date.now();
  const creada = creadaTmux(nombre);
  while (Date.now() - t0 < topeMs) {
    const sid = sidDeRegistro(nombre, creada);
    if (sid) return sid;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${nombre} no tiene session_id en el registro tras ${topeMs} ms`);
}

export async function prepararTmux(ctx, base, opciones = {}) {
  await esperarSinClaude();
  const nombre = crearTmux(base, PROYECTO);
  const sid = await esperarSid(nombre);
  const s = await ctx.abrir(opciones);
  const ack = await abrirSesion(s, sid, 60_000);
  return { s, nombre, sid, ack };
}

// Filas del transcript de una sesión (para medir latencia JSONL → DOM).
export function filasTranscript(sid) {
  try { return fs.readFileSync(path.join(TRANSCRIPTS, `${sid}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

// Procesos `claude` cuyo cwd es el proyecto de prueba (doble proceso = dos escritores).
export function procesosClaudeEnProyecto() {
  let pids = [];
  try { pids = execFileSync('pgrep', ['-x', 'claude'], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { /* ninguno */ }
  return pids.filter((pid) => { try { return fs.readlinkSync(`/proc/${pid}/cwd`) === PROYECTO; } catch { return false; } });
}

// El teardown cierra la sesión de tmux, pero el `claude` del pane tarda unos
// segundos en morir: el escenario siguiente lo contaba como un segundo
// proceso. Se espera a que el proyecto de prueba quede sin `claude`; lo que
// siga vivo al tope es de una sesión de prueba ya cerrada y se termina.
export async function esperarSinClaude(topeMs = 30_000) {
  const t0 = Date.now();
  while (procesosClaudeEnProyecto().length && Date.now() - t0 < topeMs) await new Promise((r) => setTimeout(r, 500));
  const restos = procesosClaudeEnProyecto();
  for (const pid of restos) { try { process.kill(Number(pid), 'SIGTERM'); } catch { /* ya murió */ } }
  if (restos.length) await new Promise((r) => setTimeout(r, 3000));
  return { ms: Date.now() - t0, terminados: restos };
}

export const repeticiones = () => Number(process.env.E2E_REPETICIONES ?? 3);
