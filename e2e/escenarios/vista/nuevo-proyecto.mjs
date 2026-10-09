// Plan 09-oct, Fase 3: «Nuevo proyecto» está en el pie, junto a Ajustes, y abre el asistente.
export const meta = {
  descripcion: 'Nuevo proyecto junto a Ajustes abre el asistente',
  puerto: 3902,
  checks: ['Nuevo proyecto está junto a Ajustes y abre el asistente'],
};

export async function correr(ctx) {
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  const nuevo = s.pagina.getByTestId('barra-nuevo-proyecto');
  const ajustes = s.pagina.getByTestId('barra-ajustes');
  const [a, b] = [await nuevo.boundingBox(), await ajustes.boundingBox()];
  const misma = Boolean(a && b) && Math.abs(a.y - b.y) < 8;
  await nuevo.click();
  const dialogo = await s.pagina.getByRole('dialog').waitFor({ timeout: 5000 }).then(() => true, () => false);
  ctx.check('Nuevo proyecto está junto a Ajustes y abre el asistente', misma && dialogo,
    { evidencia: await ctx.captura(s, 'asistente'), datos: { nuevo: a, ajustes: b, dialogo } });
}
