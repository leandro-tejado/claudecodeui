// Plan 09-oct, Fase 8: Ajustes → Servicios lista los puertos agrupados por
// exposición (Público, Tailnet, Solo local).
export const meta = {
  descripcion: 'Ajustes → Servicios abre la lista agrupada por exposición',
  puerto: 3902,
  checks: ['Servicios abre desde Ajustes y lista los puertos agrupados'],
};

export async function correr(ctx) {
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await s.pagina.getByTestId('barra-ajustes').click();
  await s.pagina.getByRole('menuitem', { name: 'Servicios' }).click();
  const dialogo = s.pagina.getByRole('dialog');
  const abierto = await dialogo.waitFor({ timeout: 5000 }).then(() => true, () => false);
  await s.pagina.waitForTimeout(1500);
  const filas = await dialogo.locator('[data-testid^="servicios-"]').count();
  ctx.check('Servicios abre desde Ajustes y lista los puertos agrupados', abierto && filas > 0,
    { evidencia: await ctx.captura(s, 'servicios'), datos: { abierto, filas } });
}
