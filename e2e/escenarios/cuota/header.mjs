// Punto 2: el header muestra 5 h y semanal con datos reales y los sigue sin recargar.
// En las instancias de prueba la fuente es un cuota.json propio (RUTA_CUOTA_JSON);
// contra :3001 (CLOUDCLI_URL) solo se LEE el real y se compara: nunca se escribe.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CUOTA_JSON } from '../../lib/config.mjs';
import { abrirSesion, crearSesionFalsa } from '../../lib/chat.mjs';

export const meta = { descripcion: 'ventanas 5 h y semanal en el header, y su actualización en vivo', puerto: 3902 };

const REAL = path.join(os.homedir(), '.cache/aos/cuota.json');
const contraReal = Boolean(process.env.CLOUDCLI_URL);

function escribir(cinco, siete) {
  const ahora = Math.floor(Date.now() / 1000);
  const datos = { ts: ahora, origen: 'statusline', maquina: 'vps', five_hour: cinco, five_hour_resets_at: ahora + 3 * 3600, seven_day: siete, seven_day_resets_at: ahora + 4 * 86400, ctx: 1 };
  fs.writeFileSync(`${CUOTA_JSON}.tmp`, JSON.stringify(datos));
  fs.renameSync(`${CUOTA_JSON}.tmp`, CUOTA_JSON);
}

const etiqueta = (s) => s.pagina.locator('button[aria-label^="Ventana de 5 horas"]').first().getAttribute('aria-label').catch(() => null);

async function esperarEtiqueta(s, re, topeMs) {
  const t0 = Date.now(); let ultima = null;
  while (Date.now() - t0 < topeMs) {
    ultima = await etiqueta(s);
    if (ultima && re.test(ultima)) return { ok: true, ms: Date.now() - t0, ultima };
    await s.pagina.waitForTimeout(500);
  }
  return { ok: false, ms: null, ultima };
}

export async function correr(ctx) {
  if (contraReal) {
    const real = JSON.parse(fs.readFileSync(REAL, 'utf8'));
    const s = await ctx.abrir();
    await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
    const r = await esperarEtiqueta(s, new RegExp(`${Math.round(real.five_hour)}%`), 15_000);
    ctx.check('5 h coincide con ~/.cache/aos/cuota.json', r.ok, { evidencia: await ctx.captura(s, 'real'), datos: { archivo: real.five_hour, etiqueta: r.ultima } });
    ctx.check('la semanal tiene %', /Semanal: ~?\d+%/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });
    return;
  }
  // El indicador vive en el header del chat: hace falta una sesión abierta.
  const id = crearSesionFalsa('guion:humo nonce:cuota');
  escribir(37, 21);
  const s = await ctx.abrir();
  await abrirSesion(s, id);
  const r1 = await esperarEtiqueta(s, /37%/, 15_000);
  ctx.check('5 h muestra la lectura del archivo (primera lectura del proceso)', r1.ok, { evidencia: await ctx.captura(s, 'primera-lectura'), datos: r1 });
  ctx.check('la semanal muestra % (no solo la hora de renovación)', /Semanal: ~?21%/.test(r1.ultima ?? ''), { datos: { etiqueta: r1.ultima } });
  escribir(52, 23);
  const r2 = await esperarEtiqueta(s, /52%/, 15_000);
  ctx.check('el header sigue el cambio sin recargar (≤ 15 s)', r2.ok, { evidencia: await ctx.captura(s, 'segunda-lectura'), datos: r2 });
  const boton = s.pagina.locator('button[aria-label^="Ventana de 5 horas"]').first();
  await boton.click().catch(() => {});
  await s.pagina.waitForTimeout(400);
  const pop = await s.pagina.locator('body').innerText();
  ctx.check('el detalle no dice "sin dato" en ninguna ventana', /Ventana de 5 horas/.test(pop) && !/Ventana de 5 horas[\s\S]{0,40}sin dato|Semanal[\s\S]{0,40}sin dato/.test(pop), { evidencia: await ctx.captura(s, 'detalle') });
  for (const vp of ['movil']) {
    const m = await ctx.abrir({ viewport: vp });
    await abrirSesion(m, id);
    const rm = await esperarEtiqueta(m, /52%/, 15_000);
    ctx.check(`${vp}: el header muestra la cuota`, rm.ok, { evidencia: await ctx.captura(m, `${vp}-header`), datos: rm });
  }
}
