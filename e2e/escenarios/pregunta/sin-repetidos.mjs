// Fase 9, paso 4 ("representación única"): con la pregunta pendiente, su
// texto no puede estar a la vez en el panel interactivo y en la tarjeta del
// transcript (QuestionAnswerContent la colapsa a "Open question ↓" mientras
// no hay respuesta); contestada, tiene que quedar en un solo lugar — el
// resumen de la tarjeta, una sola vez cada pregunta.
import { prepararHeadless, escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { contarApariciones } from '../../lib/navegador.mjs';

export const meta = {
  descripcion: 'cero textos de pregunta repetidos en el DOM, antes y después de contestar',
  puerto: 3902,
};

export async function correr(ctx) {
  for (const vp of ['escritorio', 'movil']) {
    const { s } = await prepararHeadless(ctx, { viewport: vp });
    const t = await escribirYEnviar(s, 'guion:pregunta');
    const btn = (texto) => s.pagina.getByRole('button', { name: new RegExp(`^\\s*\\d*\\s*${texto}`) }).last();
    const vio = await btn('Azul').waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    ctx.check(`${vp}: la pregunta llega a la UI`, vio, { evidencia: await ctx.captura(s, `${vp}-pregunta`) });
    if (!vio) continue;

    for (const texto of ['¿Qué color preferís?', '¿Qué frutas querés?', 'Elegí "una" opción con comillas']) {
      const antes = await contarApariciones(s.pagina, texto);
      ctx.check(`${vp}: "${texto}" pendiente, una sola vez en el DOM`, antes <= 1, { datos: { apariciones: antes } });
    }

    await btn('Azul').click();
    await s.pagina.getByRole('button', { name: /Next/ }).click();
    await btn('Manzana').click();
    await s.pagina.getByRole('button', { name: /Next/ }).click();
    await btn('Sí').click();
    await s.pagina.getByRole('button', { name: /Submit/ }).click();
    await esperarFin(s, t, 20_000);
    await s.pagina.waitForTimeout(2000);

    for (const texto of ['¿Qué color preferís?', '¿Qué frutas querés?', 'Elegí "una" opción con comillas']) {
      const despues = await contarApariciones(s.pagina, texto);
      ctx.check(`${vp}: "${texto}" contestada, una sola vez en el DOM`, despues === 1, {
        datos: { apariciones: despues },
        evidencia: await ctx.captura(s, `${vp}-respondida`),
      });
    }
  }
}
