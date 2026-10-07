// Fase 3: cuando la ventana YA pasó su `resets_at`, el header tiene que
// mostrar "ventana nueva" y la hora del reset — nunca el % de la ventana
// anterior, que ya cerró y mentiría si se mostrara como si siguiera activa.
import fs from 'node:fs';
import { CUOTA_JSON } from '../../lib/config.mjs';
import { abrirSesion, crearSesionFalsa } from '../../lib/chat.mjs';

export const meta = { descripcion: 'una ventana con resetsAt ya pasado muestra "ventana nueva" y la hora, no el % de la ventana cerrada', puerto: 3902 };

function escribirConResetPasado(cinco, siete) {
  const ahora = Math.floor(Date.now() / 1000);
  // La ventana de 5 h se renovó hace 5 min; la última lectura que tenemos de
  // ella es de antes de ese reset. La semanal sigue vigente (de control: no
  // tiene que verse afectada por el reset de la otra).
  const resetDeCincoHoras = ahora - 5 * 60;
  const datos = {
    ts: ahora - 6 * 60,
    origen: 'statusline', maquina: 'vps',
    five_hour: cinco, five_hour_resets_at: resetDeCincoHoras,
    seven_day: siete, seven_day_resets_at: ahora + 4 * 86400,
    ctx: 1,
  };
  fs.writeFileSync(`${CUOTA_JSON}.tmp`, JSON.stringify(datos));
  fs.renameSync(`${CUOTA_JSON}.tmp`, CUOTA_JSON);
}

const etiqueta = (s) => s.pagina.locator('button[title*="Ventana de 5 horas"]').first().getAttribute('title').catch(() => null);

async function esperarEtiqueta(s, re, topeMs) {
  const t0 = Date.now(); let ultima = null;
  while (Date.now() - t0 < topeMs) {
    ultima = await etiqueta(s);
    if (ultima && re.test(ultima)) return { ok: true, ms: Date.now() - t0, ultima };
    await s.pagina.waitForTimeout(200);
  }
  return { ok: false, ms: null, ultima };
}

export async function correr(ctx) {
  const id = crearSesionFalsa('guion:humo nonce:cuota-vieja');
  escribirConResetPasado(97, 30);
  const s = await ctx.abrir();
  await abrirSesion(s, id);

  const r = await esperarEtiqueta(s, /Ventana de 5 horas: ventana nueva/, 15_000);
  ctx.check('la ventana de 5 h muestra "ventana nueva" en vez de un % inventado', r.ok, {
    evidencia: await ctx.captura(s, 'reseteada'),
    datos: r,
  });
  ctx.check('no muestra el 97% de la ventana ya cerrada', !/97%/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });
  ctx.check('trae la hora en que se renovó', /se renovó a las \d{2}:\d{2}/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });
  ctx.check('la semanal, que no pasó su reset, sigue mostrando su % real', /Semanal: 30% real/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });

  ctx.guardar('label.txt', r.ultima ?? '');
  ctx.check('no aparece "sin dato" en ningún lado (hay lectura para las dos ventanas)', !/sin dato/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });
}
