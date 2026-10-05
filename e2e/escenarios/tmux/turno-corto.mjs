// Punto 7: tras la respuesta, la sesión de tmux pasa a libre enseguida (no queda "esperando").
import { escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';
import { prepararTmux, repeticiones } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'turnos "respondé solo OK" en una sesión creada por orquestar.py',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['cada turno pasa a libre ≤ 3 s después de que se ve la respuesta', 'cada respuesta aparece una vez'],
};

export async function correr(ctx) {
  const { s } = await prepararTmux(ctx, 'e2e-corto');
  const tiempos = [];
  for (let i = 0; i < repeticiones(); i++) {
    const n = nonce();
    const t = await escribirYEnviar(s, `Respondé solo con: OK ${n}`);
    let tVisto = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 90_000 && tVisto === null) {
      if (await contarFilas(s, `OK ${n}`)) tVisto = Date.now();
      else await s.pagina.waitForTimeout(100);
    }
    const fin = await esperarFin(s, t, 30_000);
    tiempos.push({ i, respuestaMs: tVisto && tVisto - t, libreDespuesMs: fin !== null && tVisto ? t + fin - tVisto : null, filas: await contarFilas(s, `OK ${n}`) });
  }
  const cap = await ctx.captura(s, 'final');
  ctx.guardar('tiempos.json', tiempos);
  ctx.check('cada turno pasa a libre ≤ 3 s después de que se ve la respuesta', tiempos.every((x) => x.libreDespuesMs !== null && x.libreDespuesMs <= 3000), { evidencia: cap, datos: tiempos.map((x) => x.libreDespuesMs) });
  ctx.check('cada respuesta aparece una vez', tiempos.every((x) => x.filas === 1), { datos: tiempos.map((x) => x.filas) });
}
