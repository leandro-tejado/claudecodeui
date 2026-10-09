// Plan 09-oct, Fase 3: plegada, la barra es un riel de íconos que el cursor
// asoma (≤ 150 ms) empujando el chat, se vuelve a plegar al salir y se fija
// con un clic en el logo.
export const meta = {
  descripcion: 'riel de íconos: asoma con el cursor, empuja el chat y se fija con el logo',
  puerto: 3902,
  checks: [
    'plegada queda un riel de 52 px con sus íconos',
    'el cursor la asoma en ≤ 150 ms (+ margen de pintado) y empuja el chat',
    'al salir el cursor vuelve al riel',
    'un clic en el logo la deja fija',
  ],
};

const barra = (s) => s.pagina.locator('[data-testid="barra-lateral"]');
const ancho = async (s) => (await barra(s).boundingBox())?.width ?? 0;
const xChat = async (s) => (await s.pagina.locator('textarea').first().boundingBox())?.x ?? 0;

export async function correr(ctx) {
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  // Arranca abierta, sea cual sea la preferencia guardada.
  if ((await barra(s).getAttribute('data-plegada')) === 'true') await s.pagina.getByTestId('barra-logo').first().click();

  await s.pagina.getByTestId('barra-logo').first().click();
  await s.pagina.mouse.move(900, 400);
  await s.pagina.waitForTimeout(500);
  const riel = s.pagina.getByTestId('barra-riel');
  const iconos = await riel.getByRole('button').count();
  const anchoRiel = await ancho(s);
  const chatAntes = await xChat(s);
  ctx.check('plegada queda un riel de 52 px con sus íconos', anchoRiel >= 50 && anchoRiel <= 54 && iconos === 5,
    { evidencia: await ctx.captura(s, 'riel'), datos: { anchoRiel, iconos } });

  const t0 = Date.now();
  await s.pagina.mouse.move(26, 300);
  await s.pagina.waitForFunction(() => document.querySelector('[data-testid="barra-lateral"]')?.getAttribute('data-asomada') === 'true', null, { timeout: 2000 }).catch(() => {});
  const tAsomo = Date.now() - t0;
  await s.pagina.waitForTimeout(250);
  const anchoAsomada = await ancho(s);
  const chatDespues = await xChat(s);
  ctx.check('el cursor la asoma en ≤ 150 ms (+ margen de pintado) y empuja el chat',
    tAsomo <= 300 && anchoAsomada > 200 && chatDespues > chatAntes + 100,
    { evidencia: await ctx.captura(s, 'asomada'), datos: { tAsomo, anchoAsomada, chatAntes, chatDespues } });

  await s.pagina.mouse.move(900, 400);
  await s.pagina.waitForTimeout(700);
  const devuelta = await ancho(s);
  ctx.check('al salir el cursor vuelve al riel', devuelta <= 54, { datos: { devuelta } });

  await s.pagina.mouse.move(26, 300);
  await s.pagina.waitForTimeout(400);
  await s.pagina.getByTestId('barra-logo').first().click();
  await s.pagina.mouse.move(900, 400);
  await s.pagina.waitForTimeout(700);
  const fija = await ancho(s);
  ctx.check('un clic en el logo la deja fija', fija > 200 && (await barra(s).getAttribute('data-plegada')) === 'false',
    { evidencia: await ctx.captura(s, 'fija'), datos: { fija } });
}
