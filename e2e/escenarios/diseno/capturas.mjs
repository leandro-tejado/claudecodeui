// Punto 8: estado visual de hoy (claro/oscuro × móvil/escritorio) y errores de consola.
import { prepararHeadless, escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'capturas de la línea visual y salud de la consola', puerto: 3902 };

export async function correr(ctx) {
  for (const tema of ['light', 'dark']) {
    for (const viewport of ['movil', 'escritorio']) {
      const { s } = await prepararHeadless(ctx, { tema, viewport });
      const t = await escribirYEnviar(s, `guion:subagente-a-mitad nonce:${nonce()}`);
      await s.pagina.waitForTimeout(1800);
      const capM = await ctx.captura(s, `${tema}-${viewport}-a-mitad`);
      await esperarFin(s, t, 30_000);
      await s.pagina.waitForTimeout(1500);
      const capF = await ctx.captura(s, `${tema}-${viewport}-final`);
      const desborde = await s.pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ctx.check(`${tema}/${viewport}: sin scroll horizontal`, desborde <= 0, { evidencia: [capM, capF], datos: { desborde } });
      const errores = s.errores.filter(Boolean);
      ctx.check(`${tema}/${viewport}: consola sin errores`, errores.length === 0, { datos: errores.slice(0, 3) });
    }
  }
}
