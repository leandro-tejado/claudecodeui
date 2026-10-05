// Commit 373dc739 y punto 7: un mensaje mandado con el turno en curso sale una vez y se contesta una vez.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'segundo mensaje durante un turno lento (cola)', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n1 = nonce(); const n2 = nonce();
  const t = await escribirYEnviar(s, `guion:lento nonce:${n1}`);
  await s.pagina.waitForTimeout(1200);
  await escribirYEnviar(s, `guion:humo nonce:${n2}`);
  await ctx.captura(s, 'encolado');
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 60_000 && !ok) {
    ok = (await contarFilas(s, `[${n2}]`)) >= 1;
    await s.pagina.waitForTimeout(500);
  }
  await s.pagina.waitForTimeout(3000);
  const u2 = await contarFilas(s, `nonce:${n2}`, 'user');
  const r1 = await contarFilas(s, `[${n1}]`);
  const r2 = await contarFilas(s, `[${n2}]`);
  ctx.check('el mensaje encolado se contesta', ok, { datos: { segundos: Math.round((Date.now() - t0) / 1000) } });
  ctx.check('cada mensaje del usuario aparece una vez', u2 === 1 && (await contarFilas(s, `nonce:${n1}`, 'user')) === 1, { datos: { u2 } });
  ctx.check('cada respuesta aparece una vez', r1 === 1 && r2 === 1, { evidencia: await ctx.captura(s, 'final'), datos: { r1, r2 } });
  const envios = s.frames.filter((f) => f.sentido === 'out' && /chat\.send/.test(f.datos?.type ?? '') && JSON.stringify(f.datos).includes(n2)).length;
  ctx.check('el segundo mensaje se manda una sola vez por el WS', envios <= 1, { datos: { envios } });
}
