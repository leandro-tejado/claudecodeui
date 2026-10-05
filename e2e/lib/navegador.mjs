// Chromium headless con el token de la instancia cargado, más los helpers de
// medición que usan los escenarios. Cada helper mide: ningún `sleep` fijo.
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { CHROMIUM, archivoToken, urlBase } from './config.mjs';

export const VIEWPORTS = {
  movil: { width: 390, height: 844 },
  escritorio: { width: 1280, height: 800 },
};

export async function abrir({ puerto, viewport = 'escritorio', tema = 'light', token } = {}) {
  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  const contexto = await navegador.newContext({
    viewport: VIEWPORTS[viewport] ?? viewport,
    colorScheme: tema,
    deviceScaleFactor: 1,
  });
  const tk = token ?? fs.readFileSync(archivoToken(puerto), 'utf8').trim();
  // El tema es una preferencia del usuario guardada en el server (gana sobre
  // localStorage). Solo en las instancias de prueba: contra :3001 no se toca.
  if (!process.env.CLOUDCLI_URL) {
    await fetch(`${urlBase(puerto)}/api/user/preferences`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: tema }),
    }).catch(() => {});
  }
  await contexto.addInitScript(([t, th]) => {
    localStorage.setItem('auth-token', t);
    localStorage.setItem('theme', th);
  }, [tk, tema]);
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('response', (r) => { if (r.status() >= 400) errores.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
  const frames = capturarFrames(pagina);
  return { navegador, contexto, pagina, errores, frames, base: urlBase(puerto), token: tk };
}

// Guarda todos los frames del WebSocket de la app (los dos sentidos), parseados.
export function capturarFrames(pagina) {
  const frames = [];
  pagina.on('websocket', (ws) => {
    const registrar = (sentido) => (ev) => {
      let datos = ev.payload;
      try { datos = JSON.parse(String(ev.payload)); } catch { /* binario o texto plano */ }
      frames.push({ t: Date.now(), sentido, url: ws.url(), datos });
    };
    ws.on('framereceived', registrar('in'));
    ws.on('framesent', registrar('out'));
  });
  return frames;
}

export function framesDeTipo(frames, predicado) {
  return frames.filter((f) => f.datos && typeof f.datos === 'object' && predicado(f.datos));
}

// Largo del texto de un selector, muestreado. Sirve para ver si "se escribe de a poco".
export async function muestrearTexto(pagina, selector, { cadaMs = 150, n = 40 } = {}) {
  const muestras = [];
  for (let i = 0; i < n; i++) {
    const largo = await pagina.locator(selector).last().evaluate((el) => el.textContent.length).catch(() => -1);
    muestras.push({ t: Date.now(), largo });
    await pagina.waitForTimeout(cadaMs);
  }
  return muestras;
}

// Marca el nodo y después dice si sigue siendo el mismo (no se remontó).
export async function marcarNodo(pagina, selector, marca) {
  return pagina.locator(selector).last().evaluate((el, m) => { el.dataset.e2eMarca = m; }, marca);
}
export async function sigueMarcado(pagina, marca) {
  return (await pagina.locator(`[data-e2e-marca="${marca}"]`).count()) > 0;
}

export async function contarApariciones(pagina, texto, selector = 'body') {
  return pagina.locator(selector).evaluate((root, t) => {
    const cuerpo = root.innerText;
    let n = 0; let i = cuerpo.indexOf(t);
    while (i !== -1) { n++; i = cuerpo.indexOf(t, i + t.length); }
    return n;
  }, texto);
}

// Espera una condición en el navegador y devuelve cuánto tardó (o null si no llegó).
export async function medir(pagina, fn, arg, topeMs = 30_000) {
  const t0 = Date.now();
  try {
    await pagina.waitForFunction(fn, arg, { timeout: topeMs, polling: 100 });
    return Date.now() - t0;
  } catch {
    return null;
  }
}
