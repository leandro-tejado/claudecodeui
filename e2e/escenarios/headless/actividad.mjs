// Puntos 1 y 3: se ve que está pensando, antes del primer token y con el razonamiento en vivo.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'indicador y pensamiento (guion pensamiento: 1,5 s sin tokens, thinking a 80 ms, texto)', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:pensamiento nonce:${n}`);
  await s.pagina.waitForTimeout(700);
  const cap = await ctx.captura(s, 'antes-del-primer-token');
  // El indicador: cualquier elemento visible con aria-live/role=status o texto de actividad, fuera de los mensajes.
  const indicador = await s.pagina.evaluate(() => {
    const cands = [...document.querySelectorAll('[role=status], [aria-live], [class*=ctivity], [class*=hinking], [class*=ndicator]')]
      .filter((el) => el.offsetParent !== null && el.innerText.trim());
    return cands.map((el) => el.innerText.trim().slice(0, 60));
  });
  ctx.check('hay un indicador de actividad visible antes del primer token', indicador.length > 0, { evidencia: cap, datos: { indicador } });
  // Cuándo se ve el razonamiento y cuándo la respuesta.
  let tRazon = null; let tResp = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000 && (tRazon === null || tResp === null)) {
    const txt = await s.pagina.locator('.chat-messages-pane').innerText().catch(() => '');
    if (tRazon === null && txt.includes('Estoy pensando')) tRazon = Date.now() - t;
    if (tResp === null && txt.includes('Respuesta después')) tResp = Date.now() - t;
    if (tRazon !== null && tResp === null && !ctx._capR) ctx._capR = await ctx.captura(s, 'razonamiento-en-vivo');
    await s.pagina.waitForTimeout(100);
  }
  // El guion piensa entre ~1,5 s y ~2,6 s después del envío: verlo antes de 2,3 s
  // es verlo mientras llega, no cuando el bloque ya terminó.
  ctx.check('el razonamiento se ve mientras se genera (≤ 2,3 s)', tRazon !== null && tRazon <= 2300, { evidencia: ctx._capR, datos: { tRazon, tResp } });
  const deltas = s.frames.filter((f) => f.t >= t && (f.datos?.kind === 'thinking_delta' || (f.datos?.kind === 'stream_delta' && f.datos?.thinking))).length;
  ctx.check('el server reenvía deltas de pensamiento', deltas > 0, { datos: { deltas } });
  await esperarFin(s, t, 20_000);
  await s.pagina.waitForTimeout(1500);
  ctx.check('la respuesta final aparece una vez', (await contarFilas(s, `[${n}]`)) === 1, { evidencia: await ctx.captura(s, 'final') });
}
