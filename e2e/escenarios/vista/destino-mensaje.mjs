// Plan 09-oct, Fase 7: el compositor dice a dónde va el mensaje antes de
// mandarlo. Y la reproducción del 9-oct: por cada camino que puede dejar la
// vista en el compositor vacío de un proyecto, ¿la línea lo avisa?
import { abrirSesion, crearSesionFalsa, filaProyecto, SEL } from '../../lib/chat.mjs';

const N = Number(process.env.E2E_REPETICIONES ?? 2);

export const meta = {
  descripcion: 'sin sesión, el compositor dice «Sesión nueva en <proyecto> · <cuenta>»; con sesión, nada',
  puerto: 3902,
  checks: [
    'el compositor vacío del proyecto dice el proyecto y la cuenta',
    'con una sesión abierta no aparece la línea',
    `cada camino al compositor vacío avisa (${N} vueltas × 5 caminos)`,
  ],
};

const linea = (s) => s.pagina.locator('[data-testid="destino-mensaje"]');
const leer = async (s) => ((await linea(s).count()) ? (await linea(s).first().innerText()).trim() : null);
const enSesion = (s) => /\/session\/[^/]+/.test(s.pagina.url());

export async function correr(ctx) {
  const id = crearSesionFalsa('guion:humo nonce:destino');
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await filaProyecto(s).click();
  await s.pagina.locator(SEL.composer).first().waitFor({ timeout: 15_000 });
  const vacia = await leer(s);
  ctx.check('el compositor vacío del proyecto dice el proyecto y la cuenta',
    Boolean(vacia) && vacia.includes(`Sesión nueva en ${SEL.proyecto}`) && /· (Optimum|Personal)/.test(vacia),
    { evidencia: await ctx.captura(s, 'vacio'), datos: { vacia } });

  await abrirSesion(s, id);
  const conSesion = await leer(s);
  ctx.check('con una sesión abierta no aparece la línea', conSesion === null, { evidencia: await ctx.captura(s, 'con-sesion'), datos: { conSesion } });

  // Cada camino: o termina en una sesión (y no hay línea) o en el compositor
  // vacío (y la línea lo dice). Lo que no puede pasar es vacío sin aviso.
  const caminos = {
    'botón +': async () => { await s.pagina.getByRole('button', { name: 'Nueva sesión' }).first().click(); },
    'nombre del proyecto': async () => { await filaProyecto(s).click(); },
    'recarga en /': async () => { await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' }); },
    'proyecto colapsado y reabierto': async () => { await filaProyecto(s).click(); await filaProyecto(s).click(); },
    'sesión abierta y vuelta al proyecto': async () => { await abrirSesion(s, id); await filaProyecto(s).click(); },
  };
  const filas = [];
  for (let vuelta = 1; vuelta <= N; vuelta++) {
    for (const [nombre, ir] of Object.entries(caminos)) {
      await abrirSesion(s, id);
      await ir().catch((e) => filas.push(`${nombre}: error ${String(e.message).slice(0, 60)}`));
      await s.pagina.waitForTimeout(800);
      const texto = await leer(s);
      const ok = enSesion(s) ? texto === null : Boolean(texto);
      filas.push(`${vuelta}/${nombre}: url=${enSesion(s) ? 'sesión' : 'vacía'} línea=${texto ?? '—'} ${ok ? 'ok' : 'SIN AVISO'}`);
    }
  }
  const malas = filas.filter((f) => !f.endsWith(' ok'));
  ctx.guardar('caminos.txt', filas.join('\n'));
  ctx.check(`cada camino al compositor vacío avisa (${N} vueltas × 5 caminos)`, malas.length === 0,
    { evidencia: await ctx.captura(s, 'final'), datos: { intentos: filas.length, malas } });
}
