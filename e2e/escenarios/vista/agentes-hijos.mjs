// Plan 09-oct, Fase 8: los subagentes vivos cuelgan de su sesión en la barra,
// como filas hijas, mientras corren.
import { prepararHeadless, escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'subagentes vivos como filas hijas de su sesión en la barra',
  puerto: 3902,
  checks: ['los subagentes vivos aparecen como filas hijas de su sesión'],
};

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const t = await escribirYEnviar(s, `guion:subagentes-paralelos nonce:${nonce()}`);
  const hijas = s.pagina.getByTestId('agente-hijo');
  let max = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 10_000 && max < 2) {
    max = Math.max(max, await hijas.count());
    await s.pagina.waitForTimeout(100);
  }
  const cap = await ctx.captura(s, 'hijas');
  ctx.check('los subagentes vivos aparecen como filas hijas de su sesión', max >= 2,
    { evidencia: cap, datos: { max } });
  await esperarFin(s, t, 30_000);
}
