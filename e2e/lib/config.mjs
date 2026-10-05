// Rutas y puertos del arnés E2E. Todo lo que escribe vive bajo RAIZ_TMP,
// fuera del repo y fuera de lo que usa la instancia de :3001.
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
export const CUOTA_JSON = path.join(RAIZ_TMP, 'cuota.json');
export const EVIDENCIA = path.join(REPO, 'e2e', 'evidencia');

const PUERTO_BASE = Number(process.env.E2E_PUERTO_BASE || 3900);
export const PUERTO_REAL = PUERTO_BASE + 1;
export const PUERTO_FALSO = PUERTO_BASE + 2;

// Los escenarios declaran 3901 (Claude real) o 3902 (CLI falso): se traducen a
// los puertos de esta corrida.
export function puertoDeEscenario(puerto = 3902) {
  return puerto === 3901 ? PUERTO_REAL : PUERTO_FALSO;
}

// Toda sesión que crea el arnés empieza así; el teardown no toca otra cosa.
export const PREFIJO = process.env.E2E_PREFIJO || 'e2e-';

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
