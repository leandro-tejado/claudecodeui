// Plan 09-oct, Fase 3: «Archivados» salió de la cabecera y vive en el menú de
// Ajustes. Una sesión archivada se encuentra ahí y se restaura a la lista.
import { crearSesionFalsa, filaProyecto, nonce } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'Archivados desde el menú de Ajustes: la sesión archivada vuelve a la lista',
  puerto: 3902,
  checks: ['Archivados se abre desde Ajustes y restaura la sesión'],
};

export async function correr(ctx) {
  const n = nonce();
  const id = crearSesionFalsa(`guion:humo nonce:${n}`);
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  const status = await s.pagina.evaluate(async ([sid, tok]) => (await fetch(`/api/providers/sessions/${sid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } })).status, [id, s.token]);

  await s.pagina.getByTestId('barra-ajustes').click();
  await s.pagina.getByRole('menuitem', { name: 'Archivados' }).click();
  const fila = s.pagina.getByText(`Guion humo ${n}`).first();
  const enArchivados = await fila.waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const capA = await ctx.captura(s, 'archivados');
  await fila.locator('xpath=ancestor::div[1]/..').getByTitle('Restaurar sesión').first().click().catch(async () => {
    await s.pagina.getByTitle('Restaurar sesión').first().click();
  });
  await s.pagina.getByText('Volver').click().catch(() => {});
  await filaProyecto(s).click().catch(() => {});
  const deVuelta = await filaProyecto(s).locator('xpath=following-sibling::div[1]').getByText(`Guion humo ${n}`)
    .waitFor({ timeout: 10_000 }).then(() => true, () => false);
  ctx.check('Archivados se abre desde Ajustes y restaura la sesión', status === 200 && enArchivados && deVuelta,
    { evidencia: [capA, await ctx.captura(s, 'restaurada')], datos: { status, enArchivados, deVuelta } });
}
