// Fase 9, paso 5: tras recargar, la pregunta con comillas se lee del
// `toolUseResult` estructurado (prepareTranscriptMessages → readAskAnswers),
// no de la regex de la frase de confirmación — esa regex (`[^"]+`) se corta
// en la primera comilla de la pregunta y es la que arma la respuesta en vivo,
// antes de que el historial se vuelva a leer. Cubierto a nivel unitario en
// `server/shared/tests/message-unification.test.ts`; esto confirma que el
// efecto llega hasta el DOM después de recargar de verdad.
import { prepararHeadless, escribirYEnviar, esperarFin, abrirSesion } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'la pregunta con comillas se lee bien tras recargar',
  puerto: 3902,
};

export async function correr(ctx) {
  const { s, id } = await prepararHeadless(ctx);
  const t = await escribirYEnviar(s, 'guion:pregunta');
  const btn = (texto) => s.pagina.getByRole('button', { name: new RegExp(`^\\s*\\d*\\s*${texto}`) }).last();
  const vio = await btn('Azul').waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  ctx.check('la pregunta llega a la UI', vio, { evidencia: await ctx.captura(s, 'pregunta') });
  if (!vio) return;

  await btn('Azul').click();
  await s.pagina.getByRole('button', { name: /Next/ }).click();
  await btn('Manzana').click();
  await s.pagina.getByRole('button', { name: /Next/ }).click();
  await btn('Sí').click();
  await s.pagina.getByRole('button', { name: /Submit/ }).click();
  await esperarFin(s, t, 20_000);
  await s.pagina.waitForTimeout(1500);

  // El reload real: vuelve a abrir la misma sesión desde cero, así la
  // tarjeta se arma con `prepareTranscriptMessages` sobre el transcript ya
  // persistido, no con lo que quedó en memoria del turno en vivo.
  await abrirSesion(s, id);
  await s.pagina.waitForTimeout(1000);

  const eco = await s.pagina.locator('.chat-messages-pane').innerText();
  const apariciones = (eco.match(/Elegí "una" opción con comillas/g) || []).length;
  ctx.check('tras recargar, la pregunta con comillas aparece una sola vez y completa', apariciones === 1, {
    datos: { apariciones },
    evidencia: await ctx.captura(s, 'tras-recargar'),
  });
  ctx.check('tras recargar, se ve la respuesta elegida ("Sí") junto a esa pregunta', eco.includes('Sí'), {
    evidencia: await ctx.captura(s, 'tras-recargar-respuesta'),
  });
}
