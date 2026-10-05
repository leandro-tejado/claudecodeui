// Punto 7 y commits 373dc739/8267cbe1: cinco mensajes seguidos (dos durante el turno) salen una vez cada uno.
import { escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';
import { prepararTmux, filasTranscript, procesosClaudeEnProyecto } from '../../lib/tmux.mjs';
import { leerPane } from '../../sesiones.mjs';

export const meta = {
  descripcion: 'ráfaga de 5 mensajes en tmux',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['cada mensaje 1 vez en el JSONL', 'cada mensaje 1 vez en el DOM', 'un solo proceso claude en el proyecto', 'todos contestados'],
};

export async function correr(ctx) {
  const { s, sid, nombre } = await prepararTmux(ctx, 'e2e-rafaga');
  const ns = [nonce(), nonce(), nonce(), nonce(), nonce()];
  const t = await escribirYEnviar(s, `Contá del 1 al 40 en palabras, separadas por comas. Al final escribí ${ns[0]}.`);
  await s.pagina.waitForTimeout(1500);
  await escribirYEnviar(s, `Después respondé solo: ${ns[1]}`);
  await s.pagina.waitForTimeout(800);
  await escribirYEnviar(s, `Y después respondé solo: ${ns[2]}`);
  const procDurante = procesosClaudeEnProyecto();
  await esperarFin(s, t, 180_000);
  await escribirYEnviar(s, `Respondé solo: ${ns[3]}`);
  await s.pagina.waitForTimeout(400);
  await escribirYEnviar(s, `Respondé solo: ${ns[4]}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000 && !(await contarFilas(s, ns[4]))) await s.pagina.waitForTimeout(1000);
  await s.pagina.waitForTimeout(4000);
  const filas = filasTranscript(sid);
  const enJsonl = ns.map((n) => filas.filter((f) => f.type === 'user' && JSON.stringify(f.message?.content ?? '').includes(n)).length);
  const enDom = await Promise.all(ns.map((n) => contarFilas(s, n, 'user')));
  ctx.guardar('pane.txt', leerPane(nombre));
  ctx.check('cada mensaje 1 vez en el JSONL', enJsonl.every((x) => x === 1), { datos: { enJsonl } });
  ctx.check('cada mensaje 1 vez en el DOM', enDom.every((x) => x === 1), { evidencia: await ctx.captura(s, 'final'), datos: { enDom } });
  ctx.check('un solo proceso claude en el proyecto', procDurante.length === 1 && procesosClaudeEnProyecto().length === 1, { datos: { durante: procDurante, despues: procesosClaudeEnProyecto() } });
  const respondidos = await Promise.all(ns.map((n) => contarFilas(s, n)));
  ctx.check('todos contestados', respondidos.every((x) => x >= 1), { datos: { respondidos } });
}
