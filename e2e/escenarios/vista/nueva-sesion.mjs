// Plan 09-oct, Fase 1: «Nueva sesión» falla a veces. 10 intentos desde el
// compositor vacío del proyecto; cada intento anota si navegó a /session/<id>
// y si llegó una respuesta, y qué errores salieron en la consola/red.
import { abrirProyecto, escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';

const N = Number(process.env.E2E_REPETICIONES ?? 10);

export const meta = {
  descripcion: 'nueva sesión desde el compositor: N intentos y la causa de los fallos',
  puerto: 3901, cuota: true,
  checks: [`${N} de ${N} intentos navegan a la sesión y reciben respuesta`],
};

export async function correr(ctx) {
  const s = await ctx.abrir();
  const errores = [];
  s.pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 160)));
  s.pagina.on('pageerror', (e) => errores.push(String(e).slice(0, 160)));
  const resultados = [];
  for (let i = 1; i <= N; i++) {
    const n = nonce();
    const antes = errores.length;
    let navego = false; let respondio = false; let motivo = '';
    try {
      await abrirProyecto(s);
      const t = await escribirYEnviar(s, `Respondé solo con: ${n}`);
      await s.pagina.waitForURL(/\/session\/[^/]+/, { timeout: 30_000 });
      navego = true;
      await esperarFin(s, t, 90_000);
      respondio = (await s.pagina.getByText(n).count()) > 0;
      if (!respondio) motivo = 'terminó sin la respuesta';
    } catch (e) { motivo = String(e.message).split('\n')[0].slice(0, 120); }
    resultados.push(`intento ${i}: navegó=${navego} respondió=${respondio} ${motivo} err=${errores.length - antes}`);
  }
  const ok = resultados.filter((r) => r.includes('navegó=true respondió=true')).length;
  ctx.check(`${N} de ${N} intentos navegan a la sesión y reciben respuesta`, ok === N,
    { evidencia: await ctx.captura(s, 'final'), datos: { ok, detalle: resultados.join(' | '), errores: errores.slice(0, 5).join(' | ') } });
}
