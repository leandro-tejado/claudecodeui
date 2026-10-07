// Fase 11, paso 6: el chat con el diseño nuevo en las cuatro variantes, para
// compararlo contra design-system/visual-refs/05-octubre-chat.html. Un turno con
// markdown (tabla, cita, código) y otro con una herramienta: lo que el boceto dibuja.
import { escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { VARIANTES, sesionConGuion, chequearVariante } from '../../lib/visual.mjs';

export const meta = { descripcion: 'chat a 390/1280, claro/oscuro, contra el boceto', puerto: 3902 };

export async function correr(ctx) {
  for (const v of VARIANTES) {
    const s = await sesionConGuion(ctx, v, 'guion:markdown');
    const t = await escribirYEnviar(s, 'guion:herramienta');
    await esperarFin(s, t, 30_000);
    await s.pagina.waitForTimeout(600);
    const cap = await ctx.captura(s, `chat-${v.nombre}`);
    const serif = await s.pagina.evaluate(() => [...document.querySelectorAll('.chat-message *')]
      .some((n) => /serif/i.test(getComputedStyle(n).fontFamily) && !/sans-serif/i.test(getComputedStyle(n).fontFamily)));
    ctx.check(`chat ${v.nombre}: ninguna fuente serif en los mensajes`, !serif, { evidencia: cap });
    await chequearVariante(ctx, s, `chat ${v.nombre}`, cap);
  }
}
