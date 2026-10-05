// Punto 1: la respuesta se escribe de a poco y la fila no se remonta.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';
import { muestrearTexto, marcarNodo, sigueMarcado } from '../../lib/navegador.mjs';

export const meta = { descripcion: 'tipeo gradual (guion lento, 36 deltas a 120 ms)', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const sel = `.chat-message.assistant:has-text("Uno dos")`;
  const t = await escribirYEnviar(s, `guion:lento nonce:${n}`);
  await s.pagina.locator(sel).last().waitFor({ timeout: 15_000 });
  await marcarNodo(s.pagina, sel, 'tipeo');
  const muestras = await muestrearTexto(s.pagina, sel, { cadaMs: 150, n: 25 });
  const medio = await ctx.captura(s, 'a-mitad');
  const crecientes = new Set(muestras.map((m) => m.largo).filter((l) => l > 0)).size;
  ctx.check('el texto visible crece en ≥ 5 muestras distintas', crecientes >= 5, { evidencia: medio, datos: { distintas: crecientes, largos: muestras.map((m) => m.largo).join(',') } });
  const mismoDuranteStream = await sigueMarcado(s.pagina, 'tipeo');
  ctx.check('la fila en streaming no se remonta mientras se escribe', mismoDuranteStream, { datos: { mismoDuranteStream } });
  const fin = await esperarFin(s, t, 30_000);
  await s.pagina.waitForTimeout(2000);
  const mismoAlFinal = await sigueMarcado(s.pagina, 'tipeo');
  ctx.check('al terminar sigue siendo el mismo nodo (el final no pinta otra fila)', mismoAlFinal, { datos: { mismoAlFinal, msFin: fin } });
  const filas = await contarFilas(s, `[${n}]`);
  ctx.check('una sola fila con la respuesta', filas === 1, { evidencia: await ctx.captura(s, 'final'), datos: { filas } });
}
