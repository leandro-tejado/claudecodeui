// Commits 62d63c69 (sugerencia gris = cuadro vacío) y 8267cbe1 ("Enviado" verificado).
import { escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';
import { leerPane } from '../../sesiones.mjs';

export const meta = {
  descripcion: 'enviar con la sugerencia de próximo prompt visible y estado "Enviado"',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió', '62d63c69: con la sugerencia visible, el mensaje sale y se contesta'],
};

export async function correr(ctx) {
  const { s, nombre } = await prepararTmux(ctx, 'e2e-commits');
  const n1 = nonce();
  const t1 = await escribirYEnviar(s, `Respondé solo: ${n1}`);
  const fila = s.pagina.locator('.chat-message.user').filter({ hasText: n1 }).last();
  const enviado = await fila.getByText(/Sent|Enviado/).waitFor({ timeout: 15_000 }).then(() => Date.now() - t1).catch(() => null);
  ctx.check('8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió', enviado !== null, { evidencia: await ctx.captura(s, 'enviado'), datos: { enviadoMs: enviado } });
  await esperarFin(s, t1, 90_000);
  await s.pagina.waitForTimeout(5000);
  const pane = leerPane(nombre);
  ctx.guardar('pane-con-sugerencia.txt', pane);
  // La sugerencia es texto gris después del ❯ del cuadro; sin ella el commit no se ejercita.
  const sugerencia = (/❯ ?(\S.*)$/m.exec(pane) || [])[1] ?? null;
  const n2 = nonce();
  const t2 = await escribirYEnviar(s, `Respondé solo: ${n2}`);
  const fin = await esperarFin(s, t2, 90_000);
  const fila2 = await s.pagina.locator('.chat-message.assistant').filter({ hasText: n2 }).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  ctx.check('62d63c69: con la sugerencia visible, el mensaje sale y se contesta', sugerencia !== null && fin !== null && fila2, { evidencia: await ctx.captura(s, 'final'), datos: { sugerencia, finMs: fin, respuestaVisible: fila2 } });
}
