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
export const TMUX_TMPDIR = path.join(RAIZ_TMP, 'tmux');
if (!process.env.CLOUDCLI_URL) {
  fs.mkdirSync(TMUX_TMPDIR, { recursive: true, mode: 0o700 });
  process.env.TMUX_TMPDIR = TMUX_TMPDIR;
  delete process.env.TMUX;
  delete process.env.TMUX_PANE;
}

export const CHROMIUM = path.join(
  os.homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
);

export const BIN_AOS = path.join(os.homedir(), 'workspace-leandro/.claude/bin');

export function urlBase(puerto = PUERTO_REAL) {
  return process.env.CLOUDCLI_URL || `http://127.0.0.1:${puerto}`;
}

export function archivoToken(puerto) {
  return path.join(RAIZ_TMP, `token-${puerto}`);
}
