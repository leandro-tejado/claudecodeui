// Puntos 5 y 6: el cuestionario headless contesta lo elegido, una sola vez, y no repite texto.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas } from '../../lib/chat.mjs';
import { contarApariciones } from '../../lib/navegador.mjs';

export const meta = { descripcion: 'AskUserQuestion: simple, múltiple y con comillas (modo default)', puerto: 3902 };

export async function correr(ctx) {
  for (const vp of ['escritorio', 'movil']) {
    const { s } = await prepararHeadless(ctx, { viewport: vp });
    const t = await escribirYEnviar(s, 'guion:pregunta');
    const vio = await s.pagina.getByText('¿Qué color preferís?').first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const cap = await ctx.captura(s, `${vp}-pregunta`);
    ctx.check(`${vp}: la pregunta llega a la UI`, vio, { evidencia: cap });
    if (!vio) continue;
    const antes = await contarApariciones(s.pagina, '¿Qué color preferís?');
    ctx.check(`${vp}: la pregunta pendiente se ve una sola vez`, antes === 1, { datos: { apariciones: antes } });
    const btn = (texto) => s.pagina.getByRole('button', { name: new RegExp(`^\\s*\\d*\\s*${texto}`) }).last();
    await btn('Azul').click();
    await s.pagina.getByRole('button', { name: /Next/ }).click();
    await btn('Manzana').click();
    await s.pagina.waitForTimeout(100);
    await btn('Uva').click();
    await ctx.captura(s, `${vp}-multiple`);
    await s.pagina.getByRole('button', { name: /Next/ }).click();
    await btn('Sí').click();
    await ctx.captura(s, `${vp}-comillas`);
    await s.pagina.getByRole('button', { name: /Submit/ }).click();
    await esperarFin(s, t, 20_000);
    await s.pagina.waitForTimeout(2500);
    const eco = await s.pagina.locator('.chat-messages-pane').innerText();
    const linea = (eco.match(/Elegiste: [^\n]*/) || [''])[0];
    ctx.check(`${vp}: Claude recibe exactamente lo elegido`, /Azul/.test(linea) && /Manzana/.test(linea) && /Uva/.test(linea) && /Sí/.test(linea) && !/Pera|Rojo|Verde|No\b/.test(linea), { datos: { linea } });
    const despues = await contarApariciones(s.pagina, '¿Qué color preferís?');
    const respuestaRep = await contarApariciones(s.pagina, 'Elegiste:');
    ctx.check(`${vp}: después de contestar, la pregunta y la respuesta aparecen una vez cada una`, despues <= 1 && respuestaRep === 1, { evidencia: await ctx.captura(s, `${vp}-respondida`), datos: { pregunta: despues, respuesta: respuestaRep, filasEco: await contarFilas(s, 'Elegiste:') } });
  }
}
