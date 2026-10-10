// Rutas y puertos del arnés E2E. Todo lo que escribe vive bajo RAIZ_TMP,
// fuera del repo y fuera de lo que usa la instancia de :3001.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Corridas en paralelo (una por worktree) no comparten instancia ni sesiones:
// E2E_RAIZ, E2E_PUERTO_BASE, E2E_PROYECTO_DIR y E2E_PREFIJO las separan. Sin
// esas variables quedan los valores de siempre (:3901/:3902, prefijo e2e-).
export const RAIZ_TMP = process.env.E2E_RAIZ || '/tmp/cloudcli-e2e';
export const APP = path.join(RAIZ_TMP, 'app');
// El workspace tiene que estar bajo el home (validateWorkspacePath, sin /tmp):
// va a la caché, no suelto en ~/.
// La limpieza reconoce cualquier ruta bajo .cache/cloudcli-e2e (esProyectoDePrueba).
export const PROYECTO = process.env.E2E_PROYECTO_DIR || path.join(os.homedir(), '.cache/cloudcli-e2e/proyecto');
export const EVIDENCIA = path.join(REPO, 'e2e', 'evidencia');

const PUERTO_BASE = Number(process.env.E2E_PUERTO_BASE || 3900);
export const PUERTO_REAL = PUERTO_BASE + 1;
export const PUERTO_FALSO = PUERTO_BASE + 2;

// Un cuota.json por instancia, cada uno en su directorio: la de Claude real lo
// reescribe en cada turno y el fs.watch mira el directorio entero (también
// `cuota/<id>.json`). Compartido, los escenarios de cuota/* leían lo que dejaba
// el turno anterior de :3901. Los escenarios que lo escriben corren en el falso.
export function cuotaJson(puerto) {
  return path.join(RAIZ_TMP, `cuota-${puerto}`, 'cuota.json');
}
export const CUOTA_JSON = cuotaJson(PUERTO_FALSO);

// Los escenarios declaran 3901 (Claude real) o 3902 (CLI falso): se traducen a
// los puertos de esta corrida.
export function puertoDeEscenario(puerto = 3902) {
  return puerto === 3901 ? PUERTO_REAL : PUERTO_FALSO;
}

// Toda sesión que crea el arnés empieza así; el teardown no toca otra cosa.
export const PREFIJO = process.env.E2E_PREFIJO || 'e2e-';

// Servidor de tmux propio del arnés: ni el server de prueba, ni orquestar.py,
// ni claude-tmux aceptan `-L`, pero los tres respetan TMUX_TMPDIR, y sin
// `$TMUX` (que pisa a TMUX_TMPDIR) nadie se engancha al socket de Leandro.
// Se fija acá, al importar, para que lo hereden todos los hijos. Contra
// :3001 (CLOUDCLI_URL) no se aísla: ese server solo ve el socket por defecto.
//
// El registro de sesiones va aparte por lo mismo: `sesiones.py construir` lo
// reconcilia contra el `tmux ls` del socket en que corre, y la statusline o
// aos-ciclo de Leandro, en el socket por defecto, marcaban las e2e-* como
// `caida` a mitad del escenario (el server las podaba y el envío fallaba).
// Lo respetan el server, sesiones.py/orquestar.py y el hook registro-sesion.sh,
// que lo hereda del entorno del servidor de tmux del arnés.
export const TMUX_TMPDIR = path.join(RAIZ_TMP, 'tmux');
export const REGISTRO_SESIONES = process.env.CLOUDCLI_URL
  ? path.join(os.homedir(), '.cache/aos/sesiones.json')
  : path.join(RAIZ_TMP, 'aos', 'sesiones.json');
if (!process.env.CLOUDCLI_URL) {
  fs.mkdirSync(TMUX_TMPDIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(REGISTRO_SESIONES), { recursive: true, mode: 0o700 });
  process.env.TMUX_TMPDIR = TMUX_TMPDIR;
  process.env.AOS_SESIONES_REGISTRO_PATH = REGISTRO_SESIONES;
  delete process.env.TMUX;
  delete process.env.TMUX_PANE;
}

export const CHROMIUM = path.join(
  os.homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
);

export const BIN_AOS = path.join(os.homedir(), 'workspace-leandro/.claude/bin');

// E2E_URL_UI apunta solo la interfaz a otro origen (p. ej. `vite` en dev con
// proxy a la instancia de prueba, cuando el VPS no tiene RAM para `vite build`)
// sin el cambio de modo de CLOUDCLI_URL: el aislamiento de tmux y el token en
// disco siguen siendo los de la instancia local.
export function urlBase(puerto = PUERTO_REAL) {
  return process.env.CLOUDCLI_URL || process.env.E2E_URL_UI || `http://127.0.0.1:${puerto}`;
}

export function archivoToken(puerto) {
  return path.join(RAIZ_TMP, `token-${puerto}`);
}

// Contra :3001 el login va por el entorno y el token vive solo en memoria:
// nunca se escribe a disco (Fase 12, paso 4). Usuario y contraseña se sacan de
// process.env al importar, para que no los herede ningún hijo (orquestar.py,
// tmux, claude).
const LOGIN_EXTERNO = process.env.CLOUDCLI_URL
  ? { username: process.env.CLOUDCLI_USER, password: process.env.CLOUDCLI_PASS }
  : null;
delete process.env.CLOUDCLI_USER;
delete process.env.CLOUDCLI_PASS;
let tokenExterno = null;

export async function tokenDe(puerto) {
  if (!LOGIN_EXTERNO) return fs.readFileSync(archivoToken(puerto), 'utf8').trim();
  if (tokenExterno) return tokenExterno;
  if (!LOGIN_EXTERNO.username || !LOGIN_EXTERNO.password) {
    throw new Error('contra CLOUDCLI_URL hacen falta CLOUDCLI_USER y CLOUDCLI_PASS en el entorno');
  }
  const r = await fetch(`${process.env.CLOUDCLI_URL}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LOGIN_EXTERNO),
  });
  if (!r.ok) throw new Error(`login en ${process.env.CLOUDCLI_URL}: HTTP ${r.status}`);
  tokenExterno = (await r.json()).token;
  return tokenExterno;
}

// Todo lo que va a la evidencia pasa por acá: los frames guardan la URL del
// WebSocket con `?token=`, y contra :3001 ese es el JWT de Leandro.
export function taparTokens(texto) {
  return texto.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt tapado>');
}
