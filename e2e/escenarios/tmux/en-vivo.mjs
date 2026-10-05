// Punto 7: en tmux se ve que piensa y el texto crece, no llega todo de golpe.
import { escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';
import { muestrearTexto } from '../../lib/navegador.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'indicador y texto creciendo en una sesión de tmux',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['"pensando" visible ≤ 2 s después de enviar', 'el texto crece en ≥ 3 muestras', 'al final, una sola fila de respuesta'],
};

export async function correr(ctx) {
  const { s } = await prepararTmux(ctx, 'e2e-envivo');
  const n = nonce();
  const t = await escribirYEnviar(s, `Escribí un párrafo de unas 150 palabras sobre faros. Terminá con ${n}.`);
  let tInd = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000 && tInd === null) {
    if (await s.pagina.getByText(/Thinking|Pensando|Processing/).first().isVisible().catch(() => false)) tInd = Date.now() - t;
    else await s.pagina.waitForTimeout(100);
  }
  const capI = await ctx.captura(s, 'indicador');
  ctx.check('"pensando" visible ≤ 2 s después de enviar', tInd !== null && tInd <= 2000, { evidencia: capI, datos: { tInd } });
  const largos = (await muestrearTexto(s.pagina, '.chat-message.assistant', { cadaMs: 400, n: 60 })).map((m) => m.largo);
  const distintas = new Set(largos.filter((x) => x > 0)).size;
  await esperarFin(s, t, 120_000);
  ctx.check('el texto crece en ≥ 3 muestras', distintas >= 3, { datos: { distintas, largos: largos.join(',') } });
  const filas = await s.pagina.locator('.chat-message.assistant').filter({ hasText: n }).count();
  ctx.check('al final, una sola fila de respuesta', filas === 1, { evidencia: await ctx.captura(s, 'final'), datos: { filas } });
}
