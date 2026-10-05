// Commits ed997afa/36795114 y punto 4: archivar una sesión la saca de la barra abierta, sin recargar.
import { crearSesionFalsa, filaProyecto, mostrarTodasLasSesiones, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'archivar una sesión de prueba y ver la barra', puerto: 3902 };


export async function correr(ctx) {
  const n = nonce();
  const id = crearSesionFalsa(`guion:humo nonce:${n}`);
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await mostrarTodasLasSesiones(s);
  await filaProyecto(s).click();
  const mia = () => filaProyecto(s).locator('xpath=following-sibling::div[1]').getByText(`Guion humo ${n}`).count();
  let antes = 0; const t0 = Date.now();
  while (Date.now() - t0 < 30_000 && !(antes = await mia())) await s.pagina.waitForTimeout(500);
  const capA = await ctx.captura(s, 'antes');
  const t = Date.now();
  const r = await s.pagina.evaluate(async ([sid, tok]) => (await fetch(`/api/providers/sessions/${sid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } })).status, [id, s.token]);
  let tBaja = null;
  while (Date.now() - t < 10_000 && tBaja === null) {
    if ((await mia()) < antes) tBaja = Date.now() - t;
    else await s.pagina.waitForTimeout(200);
  }
  // Control: tras recargar no está → se archivó; separa eso de "la barra no se enteró".
  await s.pagina.reload({ waitUntil: 'networkidle' });
  await filaProyecto(s).click().catch(() => {});
  await s.pagina.waitForTimeout(2000);
  const trasRecargar = await mia();
  ctx.guardar('control.json', { trasRecargar });
  ctx.check('la sesión archivada sale de la barra ≤ 3 s sin recargar', r === 200 && antes === 1 && tBaja !== null && tBaja <= 3000, { evidencia: [capA, await ctx.captura(s, 'despues')], datos: { status: r, antes, tBajaMs: tBaja, trasRecargar } });
}
