// Rutas y puertos del arnés E2E. Todo lo que escribe vive bajo RAIZ_TMP,
// fuera del repo y fuera de lo que usa la instancia de :3001.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAIZ_TMP = '/tmp/cloudcli-e2e';
export const APP = path.join(RAIZ_TMP, 'app');
// El workspace tiene que estar bajo el home (validateWorkspacePath, sin /tmp):
// va a la caché, no suelto en ~/.
export const PROYECTO = path.join(os.homedir(), '.cache/cloudcli-e2e/proyecto');
export const CUOTA_JSON = path.join(RAIZ_TMP, 'cuota.json');
export const EVIDENCIA = path.join(REPO, 'e2e', 'evidencia');

export const PUERTO_REAL = 3901;
export const PUERTO_FALSO = 3902;

// Toda sesión que crea el arnés empieza así; el teardown no toca otra cosa.
export const PREFIJO = 'e2e-';

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
