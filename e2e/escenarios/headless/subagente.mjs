// Punto 3: la actividad del subagente se ve mientras corre.
import { prepararHeadless, escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'subagente en segundo plano hablando a mitad del turno', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:subagente-a-mitad nonce:${n}`);
  let tSub = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 10_000 && tSub === null) {
    const txt = await s.pagina.locator('.chat-messages-pane').innerText().catch(() => '');
    if (txt.includes('Soy el subagente')) tSub = Date.now() - t;
    await s.pagina.waitForTimeout(100);
  }
  const cap = await ctx.captura(s, 'subagente-en-vivo');
  const fin = await esperarFin(s, t, 30_000);
  ctx.check('el texto del subagente se ve antes de que termine el turno', tSub !== null && fin !== null && tSub < fin, { evidencia: cap, datos: { tSub, fin } });
  const tarjeta = await s.pagina.locator('.chat-message.tool, .chat-message.assistant').filter({ hasText: 'Tarea falsa' }).count();
  ctx.check('hay una tarjeta del subagente con su descripción', tarjeta >= 1, { evidencia: await ctx.captura(s, 'final'), datos: { tarjeta } });
}
