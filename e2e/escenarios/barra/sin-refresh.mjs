// Plan 09-oct, Fase 1: ¿la barra se actualiza sola, sin el botón «Actualizar»?
// Se crea una sesión de tmux y se cronometra desde que entra al registro
// (session_id conocido) hasta que su fila aparece en la barra, sin recargar.
import { crearTmux } from '../../sesiones.mjs';
import { esperarSid, esperarSinClaude, repeticiones } from '../../lib/tmux.mjs';
import { mostrarTodasLasSesiones, abrirProyecto } from '../../lib/chat.mjs';
import { dormirTmux } from '../../sesiones.mjs';
import { PROYECTO } from '../../lib/config.mjs';

const TOPE_MS = 5000;
const N = Number(process.env.E2E_REPETICIONES ?? 10);

export const meta = {
  descripcion: 'una sesión de tmux nueva aparece en la barra sola, sin «Actualizar»',
  puerto: 3901, cuota: true, tmux: true,
  checks: [`la fila aparece en ≤ ${TOPE_MS} ms en ${N} de ${N} intentos`],
};

export async function correr(ctx) {
  const s = await ctx.abrir();
  await abrirProyecto(s);
  await mostrarTodasLasSesiones(s);
  const tiempos = [];
  for (let i = 1; i <= N; i++) {
    await esperarSinClaude();
    const nombre = crearTmux(`e2e-sinrefresh${i}`, PROYECTO);
    const sid = await esperarSid(nombre);
    const t0 = Date.now();
    const fila = s.pagina.locator(`a[href$="/session/${sid}"]`).first();
    let ms = null;
    while (Date.now() - t0 < 20_000) {
      if (await fila.count().catch(() => 0)) { ms = Date.now() - t0; break; }
      await s.pagina.waitForTimeout(100);
    }
    tiempos.push(ms);
    dormirTmux(nombre);
  }
  const ok = tiempos.filter((x) => x !== null && x <= TOPE_MS).length;
  ctx.check(`la fila aparece en ≤ ${TOPE_MS} ms en ${N} de ${N} intentos`, ok === N,
    { evidencia: await ctx.captura(s, 'barra'), datos: { ok, N, tiempos: tiempos.join(',') } });
}
