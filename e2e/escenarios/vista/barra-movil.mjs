// Plan 09-oct, Fase 3: en el celular no hay riel ni hover; el botón de menú abre el cajón y el fondo lo cierra.
export const meta = {
  descripcion: 'móvil 390 px: el cajón de la barra abre y cierra',
  puerto: 3902,
  checks: ['el cajón abre con el botón de menú', 'el cajón cierra tocando afuera'],
};

export async function correr(ctx) {
  const s = await ctx.abrir({ viewport: 'movil' });
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  const lista = s.pagina.getByTestId('barra-nuevo-proyecto');
  const visible = () => lista.isVisible().catch(() => false);
  if (await visible()) await s.pagina.mouse.click(380, 400);
  await s.pagina.waitForTimeout(300);
  const menu = s.pagina.getByRole('button', { name: /menú|menu/i }).first();
  await menu.click();
  await s.pagina.waitForTimeout(400);
  const abierto = await visible();
  const sinRiel = (await s.pagina.getByTestId('barra-riel').count()) === 0;
  ctx.check('el cajón abre con el botón de menú', abierto && sinRiel, { evidencia: await ctx.captura(s, 'abierto'), datos: { abierto, sinRiel } });
  await s.pagina.mouse.click(380, 400);
  await s.pagina.waitForTimeout(400);
  const cerrado = !(await visible());
  ctx.check('el cajón cierra tocando afuera', cerrado, { evidencia: await ctx.captura(s, 'cerrado'), datos: { cerrado } });
}
