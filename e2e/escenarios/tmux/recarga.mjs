// Punto 7: recargar a mitad de un turno de tmux mantiene el indicador.
import { escribirYEnviar, esperarFin, abrirSesion, nonce } from '../../lib/chat.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'recarga a mitad de un turno de tmux',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['el ack de suscripción dice que está procesando', 'tras recargar, el indicador sigue'],
};

export async function correr(ctx) {
  const { s, sid } = await prepararTmux(ctx, 'e2e-recarga');
  const n = nonce();
  const t = await escribirYEnviar(s, `Escribí un párrafo de 120 palabras sobre trenes. Terminá con ${n}.`);
  await s.pagina.waitForTimeout(3000);
  const desde = Date.now();
  const ack = await abrirSesion(s, sid);
  const ackNuevo = s.frames.filter((f) => f.t >= desde && f.datos?.kind === 'chat_subscribed' && f.datos.sessionId === sid).at(-1)?.datos ?? ack;
  ctx.check('el ack de suscripción dice que está procesando', ackNuevo.isProcessing === true, { datos: { isProcessing: ackNuevo.isProcessing, runsInTmux: ackNuevo.runsInTmux } });
  const ind = await s.pagina.getByText(/Thinking|Pensando|Processing/).first().isVisible().catch(() => false);
  ctx.check('tras recargar, el indicador sigue', ind, { evidencia: await ctx.captura(s, 'tras-recargar') });
  await esperarFin(s, t, 120_000);
}
