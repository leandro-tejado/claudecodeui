// El CLI falso responde un turno headless entero por la UI, sin gastar cuota.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'turno headless con el CLI falso', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:humo nonce:${n}`);
  const fin = await esperarFin(s, t, 20_000);
  ctx.check('llega `complete` en ≤ 10 s', fin !== null && fin <= 10_000, { datos: { ms: fin } });
  await s.pagina.waitForTimeout(1500);
  const filas = await contarFilas(s, `[${n}]`);
  ctx.check('la respuesta aparece exactamente una vez', filas === 1, { evidencia: await ctx.captura(s, 'final'), datos: { filas } });
}
