// Fase 9, paso 2 + Fase 11, paso 3: en tmux, una pregunta múltiple con clics
// a 100 ms manda las 3 tildadas. Bloqueado mientras el gobernador esté en
// rojo (crea una sesión de tmux con Claude real). Cada clic en una opción
// tilda SOLO en el estado local de `Cuestionario` (no manda nada); la pausa
// de 100 ms que pedía la línea base ya no hace falta para evitar una carrera
// contra el pane, pero se deja igual porque es el mismo ritmo de clics que
// probaba `linea-base/4158e887`. Recién el clic final en "Enviar"/"Siguiente"
// manda UNA sola orden con la selección completa (`respuestaTmux` →
// `chat.tmux-prompt-response` con `seleccion: number[]` → server
// `responderSeleccionCompuestaTmux`/`teclasParaSeleccionCompuesta`, probado
// sin tmux real en `server/modules/websocket/tests/tmux-prompt.service.test.ts`
// y en `tmux-prompt-response-entrada.test.ts`) en vez de una por clic —
// eso es lo que antes trababa esta pregunta en la pantalla "Review and
// submit" de la TUI.
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
