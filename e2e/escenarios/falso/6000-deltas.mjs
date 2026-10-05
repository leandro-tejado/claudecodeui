// Punto 1: un run largo (6000 deltas) con recarga a mitad se rearma entero y sin duplicar.
import { prepararHeadless, escribirYEnviar, esperarFin, abrirSesion } from '../../lib/chat.mjs';

export const meta = { descripcion: '6000 deltas en tandas (~3 s) y recarga a 1,5 s', puerto: 3902 };

export async function correr(ctx) {
  const { s, id } = await prepararHeadless(ctx);
  const t = await escribirYEnviar(s, 'guion:6000-deltas');
  await s.pagina.waitForTimeout(1500);
  await abrirSesion(s, id);
  const fin = await esperarFin(s, t, 30_000);
  await s.pagina.waitForTimeout(2500);
  const truncado = s.frames.some((f) => f.datos?.kind === 'history_truncated');
  ctx.check('sin `history_truncated` al reconectar', !truncado);
  // Solo filas de Claude: el prompt del usuario ("guion:6000-deltas") también dice 6000.
  const texto = (await s.pagina.locator('.chat-message.assistant').allInnerTexts()).join('\n');
  const finales = (texto.match(/\b6000\b/g) || []).length;
  ctx.check('el final del run ("6000") aparece exactamente una vez', finales === 1, { evidencia: await ctx.captura(s, 'final'), datos: { finales, msFin: fin } });
  const filas = await s.pagina.locator('.chat-message.assistant').filter({ hasText: '5900' }).count();
  ctx.check('el run entero está en una sola fila', filas === 1, { datos: { filas } });
}
