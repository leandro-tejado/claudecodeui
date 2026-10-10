// Plan 09-oct, Fase 2: la cabecera es una fila sin pestañas, y la cuota es un
// anillo con un número. «Dato real» y «resetea en» solo aparecen en el medidor.
import { abrirSesion, crearSesionFalsa } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'cabecera de una fila: sin pestañas, cuota en anillo y el detalle en el medidor',
  puerto: 3902,
  checks: [
    'escritorio: sin pestañas, una fila de ≤ 56 px',
    'escritorio: sin «dato real» ni «resetea en» a la vista',
    'el clic en el anillo abre el medidor con las dos ventanas',
    'móvil: sin «dato real» ni «resetea en» a la vista y el anillo visible',
  ],
};

const textoCabecera = (s) => s.pagina.locator('header').first().innerText();

export async function correr(ctx) {
  const id = crearSesionFalsa('guion:humo nonce:cabecera');
  const s = await ctx.abrir();
  await abrirSesion(s, id);
  const header = s.pagina.locator('header').first();
  const alto = (await header.boundingBox())?.height ?? 999;
  const pestanas = await s.pagina.locator('header [role="tab"]').count();
  ctx.check('escritorio: sin pestañas, una fila de ≤ 56 px', pestanas === 0 && alto <= 56,
    { evidencia: await ctx.captura(s, 'cabecera-1280'), datos: { pestanas, alto } });

  const texto = await textoCabecera(s);
  ctx.check('escritorio: sin «dato real» ni «resetea en» a la vista', !/dato real|resetea/i.test(texto),
    { datos: { texto } });

  await s.pagina.getByTestId('cuota-anillo').click();
  const medidor = s.pagina.getByTestId('medidor');
  await medidor.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const textoMedidor = await medidor.innerText().catch(() => '');
  ctx.check('el clic en el anillo abre el medidor con las dos ventanas',
    /5 horas/i.test(textoMedidor) && /semanal/i.test(textoMedidor) && /servidor/i.test(textoMedidor),
    { evidencia: await ctx.captura(s, 'medidor'), datos: { textoMedidor: textoMedidor.slice(0, 300) } });

  const m = await ctx.abrir({ viewport: 'movil' });
  await abrirSesion(m, id);
  const textoMovil = await textoCabecera(m);
  const anillo = await m.pagina.getByTestId('cuota-anillo').isVisible();
  ctx.check('móvil: sin «dato real» ni «resetea en» a la vista y el anillo visible',
    !/dato real|resetea/i.test(textoMovil) && anillo,
    { evidencia: await ctx.captura(m, 'cabecera-390'), datos: { textoMovil, anillo } });
}
