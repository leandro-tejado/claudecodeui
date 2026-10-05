#!/usr/bin/env node
// Instancias de prueba de CloudCLI, aisladas de la de :3001.
//
//   node e2e/instancia.mjs preparar          copia el árbol de trabajo a /tmp/cloudcli-e2e/app y compila ahí
//   node e2e/instancia.mjs up [--falso]      levanta :3901 (Claude real) o :3902 (CLI falso)
//   node e2e/instancia.mjs down [--falso]
//   node e2e/instancia.mjs estado
//
// Por qué una copia: :3001 sirve dist/ tal como está en disco, así que compilar
// en ~/cloudcli cambiaría lo que ve Leandro sin reiniciar. La copia comparte
// node_modules por symlink y tiene su propio dist/ y dist-server/.
//
// Aislamiento: auth.db, JWT_SECRET, marcador local-server.json, log de limpieza
// y cuota.json propios. Comparte ~/.claude y ~/.cache/aos (sesiones.json): ve
// lo mismo que Leandro, que es lo que se quiere probar.
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP, RAIZ_TMP, REPO, PROYECTO, CUOTA_JSON, PUERTO_REAL, PUERTO_FALSO, archivoToken,
} from './lib/config.mjs';

const NODE = '/home/leantejado/.local/node22/bin/node';
const CLAUDE_REAL = '/home/leantejado/.local/bin/claude';

function puertoDe(args) {
  return args.includes('--falso') ? PUERTO_FALSO : PUERTO_REAL;
}

function archivoPid(puerto) {
  return path.join(RAIZ_TMP, `pid-${puerto}`);
}

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function preparar() {
  fs.mkdirSync(RAIZ_TMP, { recursive: true, mode: 0o700 });
  fs.mkdirSync(PROYECTO, { recursive: true });
  // El árbol de trabajo tal cual, con cambios sin commitear incluidos.
  execFileSync('rsync', [
    '-a', '--delete',
    '--exclude', 'node_modules', '--exclude', 'dist', '--exclude', 'dist-server',
    '--exclude', 'dist-server.old', '--exclude', 'dist-server.next', '--exclude', 'dist.old',
    '--exclude', '.git', '--exclude', 'e2e/node_modules', '--exclude', 'e2e/evidencia',
    '--exclude', '.env', '--exclude', '~',
    `${REPO}/`, `${APP}/`,
  ], { stdio: 'inherit' });
  const nm = path.join(APP, 'node_modules');
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(REPO, 'node_modules'), nm);
  execFileSync('npm', ['run', 'build'], {
    cwd: APP, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' },
  });
}

async function esperarListo(puerto, topeMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/api/auth/status`);
      if (r.ok) return r.json();
    } catch { /* todavía no escucha */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`:${puerto} no respondió en ${topeMs} ms`);
}

async function asegurarUsuario(puerto) {
  const base = `http://127.0.0.1:${puerto}/api/auth`;
  const estado = await (await fetch(`${base}/status`)).json();
  const credenciales = path.join(RAIZ_TMP, `credenciales-${puerto}.json`);
  let cred;
  if (estado.needsSetup) {
    cred = { username: 'e2e', password: crypto.randomBytes(18).toString('base64url') };
    const r = await fetch(`${base}/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cred),
    });
    if (!r.ok) throw new Error(`register ${r.status}: ${await r.text()}`);
    fs.writeFileSync(credenciales, JSON.stringify(cred), { mode: 0o600 });
  } else {
    cred = JSON.parse(fs.readFileSync(credenciales, 'utf8'));
  }
  const r = await fetch(`${base}/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cred),
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`);
  const { token } = await r.json();
  fs.writeFileSync(archivoToken(puerto), token, { mode: 0o600 });
  const api = (ruta, cuerpo) => fetch(`http://127.0.0.1:${puerto}/api${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo ?? {}),
  });
  // El onboarding de la UI corre `git config --global`: se marca hecho por API
  // para no tocar la configuración de git de la máquina.
  await api('/user/complete-onboarding');
  // El proyecto descartable donde corren todas las sesiones de prueba.
  const p = await api('/projects/create-project', { path: PROYECTO, customName: 'e2e-proyecto' });
  if (!p.ok && p.status !== 409) throw new Error(`create-project ${p.status}: ${await p.text()}`);
  return token;
}

export async function up(args = []) {
  const puerto = puertoDe(args);
  const pidFile = archivoPid(puerto);
  if (fs.existsSync(pidFile) && vivo(Number(fs.readFileSync(pidFile, 'utf8')))) {
    await esperarListo(puerto);
    return asegurarUsuario(puerto);
  }
  if (!fs.existsSync(path.join(APP, 'dist-server/server/index.js'))) {
    throw new Error('No hay build en /tmp/cloudcli-e2e/app: correr `node e2e/instancia.mjs preparar`');
  }
  const secreto = path.join(RAIZ_TMP, `jwt-${puerto}`);
  if (!fs.existsSync(secreto)) fs.writeFileSync(secreto, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const falso = puerto === PUERTO_FALSO;
  // Sin las CLAUDE_CODE_* de la sesión que corre el arnés (salvo el token):
  // los procesos que levante la instancia se creerían hijos de esa sesión.
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
    k === 'CLAUDE_CODE_OAUTH_TOKEN' || !(k.startsWith('CLAUDE_CODE_') || k === 'CLAUDECODE')));
  const env = {
    ...base,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    SERVER_PORT: String(puerto),
    DATABASE_PATH: path.join(RAIZ_TMP, `auth-${puerto}.db`),
    JWT_SECRET: fs.readFileSync(secreto, 'utf8'),
    LOCAL_SERVER_MARKER_PATH: path.join(RAIZ_TMP, `local-server-${puerto}.json`),
    LIMPIEZA_MODO: 'simular',
    LIMPIEZA_LOG_PATH: path.join(RAIZ_TMP, `limpieza-${puerto}.jsonl`),
    RUTA_CUOTA_JSON: CUOTA_JSON,
    CLAUDE_CLI_PATH: falso ? path.join(REPO, 'e2e/claude-falso.mjs') : CLAUDE_REAL,
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '278000',
    E2E_PROYECTO: PROYECTO,
  };
  const log = fs.openSync(path.join(RAIZ_TMP, `server-${puerto}.log`), 'a');
  const hijo = spawn(NODE, ['dist-server/server/index.js'], {
    cwd: APP, env, detached: true, stdio: ['ignore', log, log],
  });
  hijo.unref();
  fs.writeFileSync(pidFile, String(hijo.pid));
  await esperarListo(puerto);
  return asegurarUsuario(puerto);
}

export function down(args = []) {
  const puerto = puertoDe(args);
  const pidFile = archivoPid(puerto);
  if (!fs.existsSync(pidFile)) return false;
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  if (vivo(pid)) process.kill(pid, 'SIGTERM');
  fs.rmSync(pidFile);
  return true;
}

function estado() {
  for (const puerto of [PUERTO_REAL, PUERTO_FALSO]) {
    const pidFile = archivoPid(puerto);
    const pid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, 'utf8')) : null;
    console.log(`:${puerto}`, pid && vivo(pid) ? `vivo (pid ${pid})` : 'apagado');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'preparar') preparar();
    else if (cmd === 'up') { await up(args); console.log(`:${puertoDe(args)} listo`); }
    else if (cmd === 'down') console.log(down(args) ? 'apagado' : 'no estaba levantado');
    else if (cmd === 'estado') estado();
    else { console.error('uso: instancia.mjs preparar|up|down|estado [--falso]'); process.exit(64); }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
