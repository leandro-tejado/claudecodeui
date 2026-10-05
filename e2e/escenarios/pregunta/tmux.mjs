// Puntos 5 y 6, commit 4158e887: el cuestionario de una sesión de tmux contesta lo elegido.
import { escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { contarApariciones } from '../../lib/navegador.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'AskUserQuestion en tmux: simple y múltiple (clics a 100 ms)',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['simple: la pregunta llega a la tarjeta', 'simple: llega la elegida', 'múltiple: llegan las 3 tildadas', 'la pregunta y la respuesta se ven una vez'],
};

async function preguntar(ctx, s, prompt, pregunta, elegir, etiqueta) {
  const t = await escribirYEnviar(s, prompt);
  const vio = await s.pagina.getByText(pregunta).first().waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  const cap = await ctx.captura(s, `${etiqueta}-pregunta`);
  if (!vio) return { vio, cap };
  for (const op of elegir) {
    await s.pagina.getByRole('button', { name: new RegExp(op) }).last().click();
    await s.pagina.waitForTimeout(100);
  }
  await ctx.captura(s, `${etiqueta}-elegido`);
  await s.pagina.getByRole('button', { name: /Submit|Enviar|Next|Siguiente/ }).last().click().catch(() => {});
  await esperarFin(s, t, 120_000);
  await s.pagina.waitForTimeout(2000);
  const ultima = (await s.pagina.locator('.chat-message.assistant').allInnerTexts()).at(-1) ?? '';
  return { vio, cap, ultima };
}

export async function correr(ctx) {
  const { s } = await prepararTmux(ctx, 'e2e-pregunta');
  const r1 = await preguntar(ctx, s, 'Usá la herramienta AskUserQuestion para preguntarme "¿Qué fruta elegís?" con opciones Manzana, Pera y Uva (una sola). Después respondé solo: ELEGISTE <fruta>.', '¿Qué fruta elegís?', ['Pera'], 'simple');
  ctx.check('simple: la pregunta llega a la tarjeta', r1.vio, { evidencia: r1.cap });
  ctx.check('simple: llega la elegida', /ELEGISTE\s+Pera/i.test(r1.ultima ?? ''), { datos: { ultima: r1.ultima?.slice(0, 120) } });
  const r2 = await preguntar(ctx, s, 'Usá AskUserQuestion con multiSelect para preguntarme "¿Qué colores te gustan?" con opciones Rojo, Azul, Verde y Negro. Después respondé solo: COLORES <lista>.', '¿Qué colores te gustan?', ['Rojo', 'Azul', 'Negro'], 'multi');
  ctx.check('múltiple: llegan las 3 tildadas', /Rojo/.test(r2.ultima ?? '') && /Azul/.test(r2.ultima ?? '') && /Negro/.test(r2.ultima ?? '') && !/Verde/.test(r2.ultima ?? ''), { evidencia: r2.cap, datos: { ultima: r2.ultima?.slice(0, 120) } });
  const veces = await contarApariciones(s.pagina, '¿Qué colores te gustan?');
  ctx.check('la pregunta y la respuesta se ven una vez', veces <= 1, { evidencia: await ctx.captura(s, 'final'), datos: { pregunta: veces } });
}
