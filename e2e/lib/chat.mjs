// Acciones de chat por la UI, como las haría Leandro.
export const SEL = {
  composer: 'textarea',
  enviar: 'button[aria-label="Send"]',
  proyecto: 'e2e-proyecto',
};

export async function abrirProyecto(s) {
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' }).catch(() => {});
  await s.pagina.getByText(SEL.proyecto, { exact: true }).first().click();
  await s.pagina.locator(SEL.composer).first().waitFor({ state: 'visible', timeout: 15_000 });
}

export async function escribirYEnviar(s, texto) {
  const caja = s.pagina.locator(SEL.composer).first();
  await caja.click();
  await caja.fill(texto);
  const t = Date.now();
  await caja.press('Enter');
  return t;
}

// Sesión headless nueva en el proyecto de prueba. Devuelve el id de la URL.
export async function nuevaSesion(s, texto) {
  await abrirProyecto(s);
  const t = await escribirYEnviar(s, texto);
  await s.pagina.waitForURL(/\/session\/[^/]+/, { timeout: 30_000 });
  const id = decodeURIComponent(s.pagina.url().split('/session/')[1].split(/[?#]/)[0]);
  return { id, tEnvio: t };
}

// Espera a que el turno termine según el protocolo (frame `complete`).
export async function esperarFin(s, desde, topeMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    const fin = s.frames.find((f) => f.t >= desde && f.sentido === 'in' && f.datos?.kind === 'complete');
    if (fin) return fin.t - desde;
    await s.pagina.waitForTimeout(200);
  }
  return null;
}

// Una sesión headless se arma creando primero el transcript por CLI (sin pane
// de tmux); al abrirla en la UI, el ack dice runsInTmux=false y los turnos van
// por chat.send → SDK. Con el CLI falso no gasta cuota.
import { execFileSync } from 'node:child_process';
import { PROYECTO } from './config.mjs';
const FALSO = new URL('../claude-falso.mjs', import.meta.url).pathname;

export function crearSesionFalsa(prompt = 'guion:humo') {
  const salida = execFileSync('node', [FALSO, '-p', prompt], { cwd: PROYECTO, encoding: 'utf8' });
  const init = JSON.parse(salida.split('\n')[0]);
  return init.session_id;
}

export async function abrirSesion(s, id, topeMs = 30_000) {
  const t0 = Date.now();
  // El watcher tarda en indexar un transcript nuevo: reintentar hasta que la sesión cargue.
  while (Date.now() - t0 < topeMs) {
    await s.pagina.goto(`${s.base}/session/${encodeURIComponent(id)}`, { waitUntil: 'networkidle' }).catch(() => {});
    const ack = s.frames.find((f) => f.datos?.kind === 'chat_subscribed' && f.datos.sessionId === id);
    if (ack && await s.pagina.locator(SEL.composer).first().isVisible().catch(() => false)) {
      // Los 404 de los reintentos (sesión aún sin indexar) se guardan aparte:
      // miden la carrera del punto 4, no la salud del turno.
      s.erroresDeCarga = [...(s.erroresDeCarga ?? []), ...s.errores.splice(0)];
      return ack.datos;
    }
    await s.pagina.waitForTimeout(1500);
  }
  throw new Error(`la sesión ${id} no cargó en ${topeMs} ms`);
}

// Sesión headless lista para mandar turnos en la instancia del ctx.
export async function prepararHeadless(ctx, opciones = {}) {
  const id = crearSesionFalsa(opciones.creacion ?? 'guion:humo nonce:creacion');
  const s = await ctx.abrir(opciones);
  await abrirSesion(s, id);
  return { s, id };
}

// Filas de mensajes (de un tipo) cuyo texto contiene `texto`.
export async function contarFilas(s, texto, tipo = 'assistant') {
  return s.pagina.locator(`.chat-message.${tipo}`).filter({ hasText: texto }).count();
}

export const nonce = () => Math.random().toString(36).slice(2, 8);

// Barra: por defecto filtra "solo tmux vivo" (preferencia del navegador). Las
// pruebas de la barra la apagan para ver también las headless de prueba.
export async function mostrarTodasLasSesiones(s) {
  const filtro = s.pagina.locator('button[title^="Mostrando solo sesiones con tmux vivo"]');
  if (await filtro.count()) await filtro.first().click();
}

export function filaProyecto(s, nombre = SEL.proyecto) {
  return s.pagina.locator('[data-testid="sidebar-project-row"]', { hasText: nombre }).first();
}

// Filas de sesión visibles bajo el proyecto (el bloque que sigue a su fila).
export function filasDeSesion(s, nombre = SEL.proyecto) {
  return filaProyecto(s, nombre).locator('xpath=following-sibling::div[1]').locator('[data-testid="session-status-badge"]').count();
}
