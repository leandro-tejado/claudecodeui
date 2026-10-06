// Fase 9, paso 2: en tmux, una pregunta múltiple con clics a 100 ms manda las
// 3 tildadas. Bloqueado mientras el gobernador esté en rojo (crea una sesión
// de tmux con Claude real). El plan pide que esto mande UNA sola orden con la
// selección completa en vez de una por clic — eso (`teclasParaSeleccionCompuesta`,
// `responderSeleccionCompuestaTmux`, la huella sin `marcada`) está implementado
// y probado sin tmux real en
// `server/modules/websocket/tests/tmux-prompt.service.test.ts`; falta cablear
// `TmuxPromptBanner`/`ChatInterface` para que el clic en la UI dispare esa
// orden compuesta en vez de la de siempre (una por clic) — fuera del alcance
// de esta fase (toca `src/modules/chat/ChatInterface.tsx`, de la Fase 11 en
// paralelo). Mientras tanto este escenario sigue probando el camino de
// siempre: un pedido por clic, con la pausa de 100 ms que pedía la línea base.
import { escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { contarApariciones } from '../../lib/navegador.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'tmux, múltiple con clics a 100 ms: llegan las 3',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['llegan las 3 tildadas', 'la pregunta y la respuesta se ven una vez'],
};

const opcion = (s, texto) => s.pagina.locator('button, [role=checkbox], [role=radio], [role=option], label').filter({ hasText: new RegExp(`^\\s*\\d*\\.?\\s*${texto}`) }).last();

export async function correr(ctx) {
  const { s } = await prepararTmux(ctx, 'e2e-tmux-multi');
  const t = await escribirYEnviar(s, 'Usá AskUserQuestion con multiSelect para preguntarme "¿Qué colores te gustan?" con opciones Rojo, Azul, Verde y Negro. Después respondé solo: COLORES <lista>.');
  const vio = await opcion(s, 'Rojo').waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  const cap = await ctx.captura(s, 'pregunta');
  if (!vio) {
    ctx.check('llegan las 3 tildadas', false, { evidencia: cap, datos: { motivo: 'la pregunta nunca llegó' } });
    ctx.check('la pregunta y la respuesta se ven una vez', false, { datos: { motivo: 'la pregunta nunca llegó' } });
    return;
  }
  for (const op of ['Rojo', 'Azul', 'Negro']) {
    await opcion(s, op).click();
    await s.pagina.waitForTimeout(100);
  }
  await ctx.captura(s, 'elegido');
  await s.pagina.getByRole('button', { name: /Submit|Enviar|Next|Siguiente/ }).last().click().catch(() => {});
  await esperarFin(s, t, 120_000);
  await s.pagina.waitForTimeout(2000);
  const ultima = (await s.pagina.locator('.chat-message.assistant').allInnerTexts()).at(-1) ?? '';
  ctx.check('llegan las 3 tildadas', /Rojo/.test(ultima) && /Azul/.test(ultima) && /Negro/.test(ultima) && !/Verde/.test(ultima), { evidencia: cap, datos: { ultima: ultima.slice(0, 120) } });
  const veces = await contarApariciones(s.pagina, '¿Qué colores te gustan?') - 1; // menos la del prompt
  ctx.check('la pregunta y la respuesta se ven una vez', veces <= 1, { evidencia: await ctx.captura(s, 'final'), datos: { pregunta: veces } });
}
