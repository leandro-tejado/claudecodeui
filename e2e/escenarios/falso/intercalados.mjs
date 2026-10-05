// Puntos 1 y 6 (y el fix 1329d865): eventos intercalados a mitad de bloque no parten ni duplican.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'subagente y stderr a mitad del bloque principal', puerto: 3902 };

async function caso(ctx, guion, marcaTexto) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:${guion} nonce:${n}`);
  // A mitad: cuántas filas tienen el comienzo del texto principal.
  await s.pagina.waitForTimeout(2600);
  const mitad = await contarFilas(s, marcaTexto);
  const capM = await ctx.captura(s, `${guion}-a-mitad`);
  ctx.check(`${guion}: a mitad, el texto principal está en una sola fila`, mitad <= 1, { evidencia: capM, datos: { filas: mitad } });
  await esperarFin(s, t, 30_000);
  await s.pagina.waitForTimeout(500);
  const recien = await contarFilas(s, `[${n}]`);
  const fragmentos = await contarFilas(s, marcaTexto);
  const capF = await ctx.captura(s, `${guion}-al-terminar`);
  ctx.check(`${guion}: al terminar, una fila con el texto completo y ningún fragmento suelto`, recien === 1 && fragmentos === 1, { evidencia: capF, datos: { completas: recien, conElComienzo: fragmentos } });
  await s.pagina.waitForTimeout(2500);
  const despues = await contarFilas(s, marcaTexto);
  ctx.check(`${guion}: tras refrescar el historial sigue en una fila`, despues === 1, { evidencia: await ctx.captura(s, `${guion}-refrescado`), datos: { filas: despues } });
}

export async function correr(ctx) {
  await caso(ctx, 'subagente-a-mitad', 'Mientras tanto sigo escribiendo');
  await caso(ctx, 'stderr-a-mitad', 'se cruza con stderr');
}
