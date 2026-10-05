// Fase 3: sin ningún turno (ni la statusline ni CloudCLI reescriben
// `cuota.json`) durante 20 min, el header tiene que seguir mostrando los dos
// porcentajes — con su antigüedad — en vez de "sin dato". El `ts` se
// envejece a mano, no se espera 20 min de reloj real.
import fs from 'node:fs';
import { CUOTA_JSON } from '../../lib/config.mjs';
import { abrirSesion, crearSesionFalsa } from '../../lib/chat.mjs';

export const meta = { descripcion: 'cuota.json con 20 min sin reescribirse sigue mostrando los dos %, con "hace N min"', puerto: 3902 };

function escribirVieja(cinco, siete, antiguedadMin) {
  const ahora = Math.floor(Date.now() / 1000);
  const ts = ahora - antiguedadMin * 60;
  const datos = {
    ts, origen: 'statusline', maquina: 'vps',
    // Los resets quedan bien adelante: esto prueba la antigüedad de la
    // LECTURA, no el reset de la ventana (ese caso es `cuota/vieja`).
    five_hour: cinco, five_hour_resets_at: ahora + 3 * 3600,
    seven_day: siete, seven_day_resets_at: ahora + 4 * 86400,
    ctx: 1,
  };
  fs.writeFileSync(`${CUOTA_JSON}.tmp`, JSON.stringify(datos));
  fs.renameSync(`${CUOTA_JSON}.tmp`, CUOTA_JSON);
}

const etiqueta = (s) => s.pagina.locator('button[aria-label^="Ventana de 5 horas"]').first().getAttribute('aria-label').catch(() => null);

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
  const id = crearSesionFalsa('guion:humo nonce:cuota-sin-turnos');
  escribirVieja(37, 21, 20);
  const s = await ctx.abrir();
  await abrirSesion(s, id);

  const r = await esperarEtiqueta(s, /Ventana de 5 horas: 37% hace \d+ min/, 15_000);
  ctx.check('la ventana de 5 h muestra el % con su antigüedad ("hace N min"), no "sin dato"', r.ok, {
    evidencia: await ctx.captura(s, 'vieja-20min'),
    datos: r,
  });
  ctx.check('la antigüedad reportada ronda los 20 min', r.ultima ? /hace (1[8-9]|2[0-2]) min/.test(r.ultima) : false, { datos: { etiqueta: r.ultima } });
  ctx.check('la semanal también muestra % con antigüedad, no "sin dato"', /Semanal: 21% hace \d+ min/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });

  ctx.guardar('label.txt', r.ultima ?? '');
  ctx.check('no aparece "sin dato" en ningún lado habiendo una lectura (vieja) en el archivo', !/sin dato/.test(r.ultima ?? ''), { datos: { etiqueta: r.ultima } });
}
