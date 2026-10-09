// Punto 7: recargar a mitad de un turno de tmux mantiene el indicador.
import { escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'recarga a mitad de un turno de tmux',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['el ack de suscripción dice que está procesando', 'tras recargar, el indicador sigue'],
};

// El botón Stop con el atajo `esc` es la señal estable del indicador: el
// rótulo "Thinking" se oculta mientras llega texto (Fase 5, paso 7).
const stop = (s) => s.pagina.locator('button:has(kbd)', { hasText: 'Stop' }).first();

export async function correr(ctx) {
  const { s, sid } = await prepararTmux(ctx, 'e2e-recarga');
  const n = nonce();
  // Largo a propósito: en :3001 (9-oct) el párrafo de 120 palabras terminó en
  // 7 s y la recarga llegó con el turno ya cerrado — el ack decía bien
  // `isProcessing:false` y el check fallaba por la carrera, no por el producto.
  const t = await escribirYEnviar(s, `Escribí un texto de 600 palabras sobre trenes, en seis párrafos. Terminá con ${n}.`);
  // Se recarga en cuanto el turno está en curso, no tras una espera fija.
  await stop(s).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  const desde = Date.now();
  // Sin `networkidle`: en :3001, con muchas sesiones, tardaba ~30 s en
  // asentarse y el turno terminaba en el medio.
  await s.pagina.reload({ waitUntil: 'domcontentloaded' });
  let ackNuevo = null;
  while (!ackNuevo && Date.now() - desde < 20_000) {
    ackNuevo = s.frames.filter((f) => f.t >= desde && f.datos?.kind === 'chat_subscribed' && f.datos.sessionId === sid).at(-1)?.datos ?? null;
    if (!ackNuevo) await s.pagina.waitForTimeout(200);
  }
  const cerroAntes = s.frames.some((f) => f.t >= t && f.t < desde && f.sentido === 'in' && f.datos?.kind === 'complete' && f.datos.sessionId === sid);
  ctx.check('el ack de suscripción dice que está procesando', ackNuevo?.isProcessing === true, { datos: { isProcessing: ackNuevo?.isProcessing, runsInTmux: ackNuevo?.runsInTmux, msHastaAck: ackNuevo ? null : 'sin ack en 20 s', turnoCerradoAntesDeRecargar: cerroAntes } });
  const ind = await stop(s).waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  ctx.check('tras recargar, el indicador sigue', ind, { evidencia: await ctx.captura(s, 'tras-recargar') });
  await esperarFin(s, t, 180_000);
}
