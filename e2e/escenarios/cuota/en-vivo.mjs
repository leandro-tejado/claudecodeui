// Fase 3 del plan `05-octubre-revision-punta-a-punta.md`: con el header ya
// abierto, reescribir `cuota.json` (mismo patrón de rename que usa
// `writeCuotaFile`) tiene que llegar en ≤ 3 s SIN recargar la página — el
// `fs.watch` + debounce que agrega esta fase, no el fetch inicial que ya
// cubre `cuota/header`.
import fs from 'node:fs';
import { CUOTA_JSON } from '../../lib/config.mjs';
import { abrirSesion, crearSesionFalsa } from '../../lib/chat.mjs';

export const meta = { descripcion: 'cuota.json reescrito con el header ya abierto llega en ≤ 3 s, sin recargar (fs.watch)', puerto: 3902 };

function escribir(cinco, siete) {
  const ahora = Math.floor(Date.now() / 1000);
  const datos = {
    ts: ahora, origen: 'statusline', maquina: 'vps',
    five_hour: cinco, five_hour_resets_at: ahora + 3 * 3600,
    seven_day: siete, seven_day_resets_at: ahora + 4 * 86400,
    ctx: 1,
  };
  // El mismo patrón de escritura que `writeCuotaFile`: a un temp y rename, no
  // un write directo — es justamente lo que el watcher tiene que notar.
  fs.writeFileSync(`${CUOTA_JSON}.tmp`, JSON.stringify(datos));
  fs.renameSync(`${CUOTA_JSON}.tmp`, CUOTA_JSON);
}

const etiqueta = (s) => s.pagina.locator('button[title*="Ventana de 5 horas"]').first().getAttribute('title').catch(() => null);

async function esperarEtiqueta(s, re, topeMs) {
  const t0 = Date.now(); let ultima = null;
  while (Date.now() - t0 < topeMs) {
    ultima = await etiqueta(s);
    if (ultima && re.test(ultima)) return { ok: true, ms: Date.now() - t0, ultima };
    await s.pagina.waitForTimeout(150);
  }
  return { ok: false, ms: null, ultima };
}

export async function correr(ctx) {
  const id = crearSesionFalsa('guion:humo nonce:cuota-en-vivo');
  escribir(41, 22);
  const s = await ctx.abrir();
  await abrirSesion(s, id);

  // Primera lectura: la que ya cubre `cuota/header` (fetch inicial al montar).
  const r1 = await esperarEtiqueta(s, /41%/, 15_000);
  ctx.check('el header abre con la primera lectura del archivo', r1.ok, { evidencia: await ctx.captura(s, 'primera-lectura'), datos: r1 });

  // El cambio real de esta Fase: reescribir el archivo con el header YA
  // abierto, y medir cuánto tarda en reflejarse sin recargar — el fs.watch
  // (debounce 300 ms) + el debounce del broadcast (1 s), no el poll de
  // respaldo de 60 s.
  const t0 = Date.now();
  escribir(52, 23);
  const r2 = await esperarEtiqueta(s, /52%/, 3_000);
  ctx.check('el header sigue el cambio del archivo en ≤ 3 s, sin recargar', r2.ok, {
    evidencia: await ctx.captura(s, 'segunda-lectura'),
    datos: { ...r2, msReales: r2.ms ?? Date.now() - t0 },
  });
  ctx.check('la semanal también se actualizó (23%)', /Semanal: ~?23%/.test(r2.ultima ?? ''), { datos: { etiqueta: r2.ultima } });

  const etiquetaFinal = r2.ultima ?? r1.ultima ?? '';
  ctx.guardar('label-final.txt', etiquetaFinal);
  ctx.check('el label no dice "sin dato" habiendo archivo', !/sin dato/.test(etiquetaFinal), { datos: { etiqueta: etiquetaFinal } });
}
