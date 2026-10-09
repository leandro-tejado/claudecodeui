// Punto 8: recargar a mitad del turno no cambia el resultado.
import { prepararHeadless, escribirYEnviar, esperarFin, abrirSesion, contarFilas, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'recarga a mitad de un turno lento', puerto: 3902 };

export async function correr(ctx) {
  const { s, id } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:lento nonce:${n}`);
  await s.pagina.waitForTimeout(2000);
  await abrirSesion(s, id);
  const capR = await ctx.captura(s, 'tras-recargar');
  // Mientras llega texto la etiqueta del indicador se calla (Fase 5, paso 7): lo que
  // prueba que el indicador sigue es su Stop, el único botón Stop con atajo `esc`.
  // Por el atajo y no por el texto: con la UI en español el botón dice "Detener".
  const stopDelIndicador = s.pagina.locator('button:has(kbd:text-is("esc"))');
  const indicador = await stopDelIndicador.first().isVisible().catch(() => false);
  ctx.check('tras recargar a mitad, el indicador de actividad sigue', indicador, { evidencia: capR });
  await esperarFin(s, t, 30_000);
  await s.pagina.waitForTimeout(2000);
  // Control negativo: si el selector diera verde con el turno cerrado, el check de arriba no probaría nada.
  const sigueAlTerminar = await stopDelIndicador.first().isVisible().catch(() => false);
  ctx.check('al terminar el turno el indicador se va', !sigueAlTerminar, { evidencia: await ctx.captura(s, 'al-terminar') });
  const filas = await contarFilas(s, `[${n}]`);
  const fragmentos = await contarFilas(s, 'Uno dos tres');
  ctx.check('una sola fila completa y sin fragmentos', filas === 1 && fragmentos === 1, { evidencia: await ctx.captura(s, 'final'), datos: { completas: filas, conElComienzo: fragmentos } });
}
