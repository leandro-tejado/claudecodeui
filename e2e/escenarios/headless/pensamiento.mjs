// Punto 1: un turno headless real con Sonnet muestra el razonamiento mientras se genera.
import { execFileSync } from 'node:child_process';
import { abrirSesion, escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { PROYECTO } from '../../lib/config.mjs';

export const meta = {
  descripcion: 'thinking real (Sonnet) por chat.send',
  puerto: 3901, cuota: true,
  checks: ['llegan deltas de pensamiento con texto', 'el razonamiento se ve antes de la respuesta'],
};

export async function correr(ctx) {
  // Sesión sin pane: se crea con un -p mínimo en Haiku.
  const salida = execFileSync('claude', ['-p', '--model', 'haiku', '--output-format', 'json', 'Respondé solo: listo'], { cwd: PROYECTO, encoding: 'utf8', timeout: 120_000 });
  const sid = JSON.parse(salida).session_id;
  const s = await ctx.abrir();
  await s.pagina.addInitScript(() => localStorage.setItem('claude-model', 'sonnet'));
  await abrirSesion(s, sid);
  const t = await escribirYEnviar(s, '¿Cuántos números primos hay entre 100 y 150? Pensalo paso a paso antes de responder y dame solo el número.');
  let tRazon = null; let tResp = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && tResp === null) {
    if (tRazon === null && await s.pagina.getByText(/Thinking|Razonamiento|Pensamiento/i).filter({ hasNot: s.pagina.locator('[role=status]') }).first().isVisible().catch(() => false)) tRazon = Date.now() - t;
    if (s.frames.some((f) => f.t >= t && f.datos?.kind === 'complete')) tResp = Date.now() - t;
    await s.pagina.waitForTimeout(150);
  }
  await esperarFin(s, t, 30_000);
  const deltas = s.frames.filter((f) => f.t >= t && (f.datos?.kind === 'thinking_delta' || (f.datos?.kind === 'stream_delta' && f.datos?.thinking)));
  ctx.check('llegan deltas de pensamiento con texto', deltas.length > 0, { datos: { deltas: deltas.length } });
  ctx.check('el razonamiento se ve antes de la respuesta', tRazon !== null && tResp !== null && tRazon < tResp, { evidencia: await ctx.captura(s, 'final'), datos: { tRazon, tResp } });
}
