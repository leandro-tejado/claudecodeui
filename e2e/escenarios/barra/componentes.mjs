// Paso 5 de la Fase 8 y el check "cada componente del inventario se
// actualiza sin recargar": lo que el inventario (`docs/actualizacion-en-vivo.md`)
// marcó como roto y se arregló en esta fase, en una sesión sin tmux (headless,
// con el CLI falso) para no competir con el gobernador.
//
// De la barra, no de dentro del chat (eso es `Ignorar: chat`): renombrar una
// sesión (PUT /sessions/:id) ahora manda `session_upserted` —
// `sessions.service.ts#renameSessionById` antes guardaba el nombre nuevo y
// no avisaba a nadie, así que el título viejo quedaba en la barra de
// cualquier pestaña (incluida la que hizo el PUT) hasta recargar. Se mide en
// la misma pestaña porque el WS trata a todas igual: si el productor no
// emite, esta tampoco se actualiza sola — es el mismo supuesto que usa
// `barra/archivar.mjs` para su DELETE.
import { crearSesionFalsa, filaProyecto, mostrarTodasLasSesiones, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'renombrar una sesión se ve en la barra sin recargar', puerto: 3902 };

export async function correr(ctx) {
  const n = nonce();
  const id = crearSesionFalsa(`guion:humo nonce:${n}`);
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await mostrarTodasLasSesiones(s);
  await filaProyecto(s).click();

  const filaOriginal = () => filaProyecto(s).locator('xpath=following-sibling::div[1]').getByText(`Guion humo ${n}`).count();
  const filaNueva = (texto) => filaProyecto(s).locator('xpath=following-sibling::div[1]').getByText(texto).count();

  let antes = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 30_000 && !(antes = await filaOriginal())) await s.pagina.waitForTimeout(500);
  const capAntes = await ctx.captura(s, 'antes-de-renombrar');

  const nuevoTitulo = `Renombrada en vivo ${n}`;
  const t = Date.now();
  const status = await s.pagina.evaluate(
    async ([sid, tok, titulo]) => (
      await fetch(`/api/providers/sessions/${sid}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: titulo }),
      })
    ).status,
    [id, s.token, nuevoTitulo],
  );

  let tCambio = null;
  while (Date.now() - t < 10_000 && tCambio === null) {
    if ((await filaNueva(nuevoTitulo)) >= 1) tCambio = Date.now() - t;
    else await s.pagina.waitForTimeout(200);
  }

  ctx.check(
    'renombrar una sesión actualiza su fila en la barra en ≤ 3 s sin recargar',
    status === 200 && antes === 1 && tCambio !== null && tCambio <= 3000,
    {
      evidencia: [capAntes, await ctx.captura(s, 'despues-de-renombrar')],
      datos: { status, antes, tCambioMs: tCambio, nuevoTitulo },
    },
  );
}
