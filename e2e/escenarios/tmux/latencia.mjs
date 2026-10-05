// Punto 7: la primera fila que Claude escribe en el JSONL llega al navegador en ≤ 1,5 s.
import { escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';
import { prepararTmux, filasTranscript } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'latencia JSONL → DOM en tmux',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL'],
};

export async function correr(ctx) {
  const { s, sid } = await prepararTmux(ctx, 'e2e-latencia');
  const n = nonce();
  const antes = filasTranscript(sid).length;
  const t = await escribirYEnviar(s, `Respondé en una línea: la palabra LISTO y el código ${n}`);
  let tJsonl = null; let tDom = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000 && (tJsonl === null || tDom === null)) {
    if (tJsonl === null && filasTranscript(sid).slice(antes).some((f) => f.type === 'assistant' && JSON.stringify(f.message?.content ?? '').includes(n))) tJsonl = Date.now();
    if (tDom === null && await s.pagina.locator('.chat-message.assistant').filter({ hasText: n }).count()) tDom = Date.now();
    await s.pagina.waitForTimeout(50);
  }
  await esperarFin(s, t, 30_000);
  ctx.check('la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL', tJsonl !== null && tDom !== null && tDom - tJsonl <= 1500, { evidencia: await ctx.captura(s, 'final'), datos: { jsonlMs: tJsonl && tJsonl - t, domMs: tDom && tDom - t, latenciaMs: tJsonl && tDom ? tDom - tJsonl : null } });
}
