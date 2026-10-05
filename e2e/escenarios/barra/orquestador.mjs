// Punto 4 de la Fase 8: una sesión creada por el orquestador aparece en la
// barra abierta sin recargar, 5 de 5 veces en ≤ 3 s; y dormirla (que mata el
// pane pero NUNCA reescribe sesiones.json, solo hibernadas.json) también
// cambia su estado ahí, sin recargar.
//
// Las 5 repeticiones se duermen una por una apenas se miden: el check no
// necesita más de una sesión viva del orquestador a la vez, y así no se
// amontonan paneles de prueba contra el techo del gobernador.
import { crearTmux, dormirTmux } from '../../sesiones.mjs';
import { esperarSid } from '../../lib/tmux.mjs';
import { PROYECTO } from '../../lib/config.mjs';
import { filaProyecto, filasDeSesion, mostrarTodasLasSesiones } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'orquestar.py crear → fila nueva en la barra, 5 veces; dormir la cambia en vivo',
  puerto: 3901, cuota: true, tmux: true,
  checks: [
    'orquestar.py crear aparece en la barra abierta en ≤ 3 s, 5 de 5',
    'orquestar.py dormir cambia el estado en vivo (la fila sale de la barra sin recargar)',
  ],
};

async function esperarFilaMasAlta(s, antes, topeMs) {
  const t = Date.now();
  while (Date.now() - t < topeMs) {
    if ((await filasDeSesion(s)) > antes) return Date.now() - t;
    await s.pagina.waitForTimeout(150);
  }
  return null;
}

async function esperarFilaMasBaja(s, antes, topeMs) {
  const t = Date.now();
  while (Date.now() - t < topeMs) {
    if ((await filasDeSesion(s)) < antes) return Date.now() - t;
    await s.pagina.waitForTimeout(150);
  }
  return null;
}

export async function correr(ctx) {
  const s = await ctx.abrir();
  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await mostrarTodasLasSesiones(s);
  await filaProyecto(s).click();
  await s.pagina.waitForTimeout(1500);

  const intentos = [];
  let ultimoNombre = null;
  let ultimoSid = null;

  for (let i = 0; i < 5; i++) {
    const antes = await filasDeSesion(s);
    const nombre = crearTmux(`e2e-orq-${i}`, PROYECTO);
    const tFilaMs = await esperarFilaMasAlta(s, antes, 30_000);
    const sid = await esperarSid(nombre).catch(() => null);
    intentos.push({ intento: i, nombre, sid, tFilaMs });
    ultimoNombre = nombre;
    ultimoSid = sid;

    // Se duerme ya: la próxima iteración no necesita verla viva, y el
    // check de "dormir cambia el estado" se mide aparte, sobre la última.
    if (i < 4) {
      dormirTmux(nombre);
    }
  }

  const exitos = intentos.filter((x) => x.tFilaMs !== null && x.tFilaMs <= 3000).length;
  ctx.check(
    'orquestar.py crear aparece en la barra abierta en ≤ 3 s, 5 de 5',
    exitos === 5,
    { evidencia: [await ctx.captura(s, 'cinco-creaciones')], datos: { exitos, intentos } },
  );

  // Punto 4, sobre la última de las cinco (todavía viva): dormirla la tiene
  // que sacar de la barra sin que nadie recargue. El pane muere con
  // `kill-session`; `sesiones.json` sigue diciendo "viva" (Fase 8) — lo que
  // se mide es que la fila se vaya igual, gracias al `fs.watch` del registro
  // más la verificación real de tmux (`tmux-registry-sessions.service.ts`).
  const antesDormir = await filasDeSesion(s);
  const capAntes = await ctx.captura(s, 'antes-dormir');
  const resultadoDormir = dormirTmux(ultimoNombre);
  const tBajaMs = await esperarFilaMasBaja(s, antesDormir, 15_000);
  ctx.check(
    'orquestar.py dormir cambia el estado en vivo (la fila sale de la barra sin recargar)',
    tBajaMs !== null,
    {
      evidencia: [capAntes, await ctx.captura(s, 'despues-dormir')],
      datos: { antesDormir, tBajaMs, nombre: ultimoNombre, sid: ultimoSid, dormidaOk: resultadoDormir.cerrada },
    },
  );
}
