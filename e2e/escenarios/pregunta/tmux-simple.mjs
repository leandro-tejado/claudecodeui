// Fase 9, paso 2: en tmux, una pregunta de opción única manda la elegida.
// Bloqueado mientras el gobernador esté en rojo (crea una sesión de tmux con
// Claude real) — la lógica de composición de teclas que agrega esta fase
// (`teclasParaSeleccionCompuesta`, `responderSeleccionCompuestaTmux`) está
// cubierta sin tmux real en
// `server/modules/websocket/tests/tmux-prompt.service.test.ts`.
import { escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'tmux, opción única: llega la elegida',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['la pregunta llega a la tarjeta', 'llega la elegida'],
};

const opcion = (s, texto) => s.pagina.locator('button, [role=checkbox], [role=radio], [role=option], label').filter({ hasText: new RegExp(`^\\s*\\d*\\.?\\s*${texto}`) }).last();

export async function correr(ctx) {
  const { s } = await prepararTmux(ctx, 'e2e-tmux-simple');
  const t = await escribirYEnviar(s, 'Usá la herramienta AskUserQuestion para preguntarme "¿Qué fruta elegís?" con opciones Manzana, Pera y Uva (una sola). Después respondé solo: ELEGISTE <fruta>.');
  const vio = await opcion(s, 'Pera').waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  const cap = await ctx.captura(s, 'pregunta');
  ctx.check('la pregunta llega a la tarjeta', vio, { evidencia: cap });
  if (!vio) {
    ctx.check('llega la elegida', false, { datos: { motivo: 'la pregunta nunca llegó' } });
    return;
  }
  await opcion(s, 'Pera').click();
  await ctx.captura(s, 'elegido');
  await s.pagina.getByRole('button', { name: /Submit|Enviar|Next|Siguiente/ }).last().click().catch(() => {});
  await esperarFin(s, t, 120_000);
  await s.pagina.waitForTimeout(2000);
  const ultima = (await s.pagina.locator('.chat-message.assistant').allInnerTexts()).at(-1) ?? '';
  ctx.check('llega la elegida', /ELEGISTE\s+Pera/i.test(ultima), { evidencia: await ctx.captura(s, 'final'), datos: { ultima: ultima.slice(0, 120) } });
}
