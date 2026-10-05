// Punto 4: una sesión creada por el orquestador aparece en la barra abierta, sin recargar.
import { crearTmux } from '../../sesiones.mjs';
import { esperarSid } from '../../lib/tmux.mjs';
import { PROYECTO } from '../../lib/config.mjs';
import { filaProyecto, filasDeSesion, mostrarTodasLasSesiones } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'orquestar.py crear → fila nueva en la barra',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['la sesión nueva aparece en la barra ≤ 3 s sin recargar'],
};


export async function correr(ctx) {
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await mostrarTodasLasSesiones(s);
  await filaProyecto(s).click();
  await s.pagina.waitForTimeout(1500);
  const antes = await filasDeSesion(s);
  const capA = await ctx.captura(s, 'antes');
  const t = Date.now();
  const nombre = crearTmux('e2e-orq', PROYECTO);
  let tFila = null;
  while (Date.now() - t < 30_000 && tFila === null) {
    if ((await filasDeSesion(s)) > antes) tFila = Date.now() - t;
    else await s.pagina.waitForTimeout(200);
  }
  const sid = await esperarSid(nombre).catch(() => null);
  const frame = s.frames.find((f) => f.t >= t && f.datos?.kind === 'session_upserted' && JSON.stringify(f.datos).includes(sid ?? '¬'));
  ctx.check('la sesión nueva aparece en la barra ≤ 3 s sin recargar', tFila !== null && tFila <= 3000, { evidencia: [capA, await ctx.captura(s, 'despues')], datos: { antes, tFilaMs: tFila, tFrameMs: frame ? frame.t - t : null, nombre, sid } });
}
