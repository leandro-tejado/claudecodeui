// Sesiones de tmux de prueba creadas como las crea el orquestador, abiertas en la UI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROYECTO } from './config.mjs';
import { crearTmux } from '../sesiones.mjs';
import { abrirSesion } from './chat.mjs';

const REGISTRO = path.join(os.homedir(), '.cache/aos/sesiones.json');
export const TRANSCRIPTS = path.join(os.homedir(), '.claude/projects', PROYECTO.replace(/[^a-zA-Z0-9]/g, '-'));

export function sidDeRegistro(nombre) {
  try { return JSON.parse(fs.readFileSync(REGISTRO, 'utf8'))[nombre]?.session_id ?? null; } catch { return null; }
}

// El hook SessionStart escribe el session_id en el registro unos segundos después de crear.
export async function esperarSid(nombre, topeMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    const sid = sidDeRegistro(nombre);
    if (sid) return sid;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${nombre} no tiene session_id en el registro tras ${topeMs} ms`);
}

export async function prepararTmux(ctx, base, opciones = {}) {
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

export const repeticiones = () => Number(process.env.E2E_REPETICIONES ?? 3);
