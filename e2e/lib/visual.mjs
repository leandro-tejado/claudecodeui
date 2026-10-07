// Fase 11, paso 6: helpers compartidos por visual/* y a11y/*. Una vuelta por las
// cuatro variantes (390/1280 × claro/oscuro) con una sesión headless del CLI falso.
import { createRequire } from 'node:module';
import { prepararHeadless, escribirYEnviar, esperarFin } from './chat.mjs';

export const VARIANTES = ['movil', 'escritorio'].flatMap((viewport) =>
  ['light', 'dark'].map((tema) => ({ viewport, tema, nombre: `${viewport}-${tema}` })));

// Abre una sesión en la variante, manda el guion y espera a que el turno termine
// (o, con `hasta`, a que aparezca ese locator: el cuestionario deja el turno abierto).
export async function sesionConGuion(ctx, variante, guion, { hasta } = {}) {
  const { s } = await prepararHeadless(ctx, { tema: variante.tema, viewport: variante.viewport });
  const t = await escribirYEnviar(s, guion);
  if (hasta) await hasta(s).waitFor({ state: 'visible', timeout: 20_000 });
  else await esperarFin(s, t, 30_000);
  await s.pagina.waitForTimeout(600);
  return s;
}

export async function desborde(s) {
  return s.pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// Checks comunes de cada captura: sin scroll horizontal y consola limpia.
export async function chequearVariante(ctx, s, prefijo, cap) {
  const d = await desborde(s);
  ctx.check(`${prefijo}: sin scroll horizontal`, d <= 0, { evidencia: cap, datos: { desborde: d } });
  const errores = s.errores.filter(Boolean);
  ctx.check(`${prefijo}: consola sin errores`, errores.length === 0, { evidencia: cap, datos: errores.slice(0, 3) });
}

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

// Corre axe sobre la página y devuelve solo las violaciones serias o críticas.
export async function axeGraves(pagina, incluir) {
  await pagina.addScriptTag({ path: AXE });
  const r = await pagina.evaluate(async (sel) => {
    const res = await window.axe.run(sel ? document.querySelector(sel) || document : document, {
      resultTypes: ['violations'],
    });
    return res.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, nodos: v.nodes.length,
        detalle: v.nodes.slice(0, 8).map((n) => ({ html: n.html.slice(0, 140), resumen: n.failureSummary?.slice(0, 220) })) }));
  }, incluir ?? null);
  return r;
}
