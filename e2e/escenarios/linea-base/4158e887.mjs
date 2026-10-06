// Línea base, commit 4158e887: el cuestionario de una sesión de tmux contesta
// lo elegido, simple y múltiple (clics a 100 ms). Fase 9 no puede romper esto
// — es el escenario original de `pregunta/tmux.mjs`, sin tocar, bajo el
// nombre que pide el plan para el check "la línea base sigue verde".
import { escribirYEnviar, esperarFin } from '../../lib/chat.mjs';
import { contarApariciones } from '../../lib/navegador.mjs';
import { prepararTmux } from '../../lib/tmux.mjs';

export const meta = {
  descripcion: 'línea base 4158e887: AskUserQuestion en tmux, simple y múltiple',
  puerto: 3901, cuota: true, tmux: true,
  checks: ['simple: la pregunta llega a la tarjeta', 'simple: llega la elegida', 'múltiple: llegan las 3 tildadas', 'la pregunta y la respuesta se ven una vez'],
};

// Una opción de la tarjeta, sea botón, casilla o radio (la múltiple usa casillas).
const opcion = (s, texto) => s.pagina.locator('button, [role=checkbox], [role=radio], [role=option], label').filter({ hasText: new RegExp(`^\\s*\\d*\\.?\\s*${texto}`) }).last();

async function preguntar(ctx, s, prompt, elegir, etiqueta) {
  const t = await escribirYEnviar(s, prompt);
  // Se espera la primera opción como botón: el texto de la pregunta también está en el prompt del usuario.
  const vio = await opcion(s, elegir[0]).waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  const cap = await ctx.captura(s, `${etiqueta}-pregunta`);
  if (!vio) return { vio, cap };
  for (const op of elegir) {
    await opcion(s, op).click();
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
  const { s } = await prepararTmux(ctx, 'e2e-linea-base');
  const r1 = await preguntar(ctx, s, 'Usá la herramienta AskUserQuestion para preguntarme "¿Qué fruta elegís?" con opciones Manzana, Pera y Uva (una sola). Después respondé solo: ELEGISTE <fruta>.', ['Pera'], 'simple');
  ctx.check('simple: la pregunta llega a la tarjeta', r1.vio, { evidencia: r1.cap });
  ctx.check('simple: llega la elegida', /ELEGISTE\s+Pera/i.test(r1.ultima ?? ''), { datos: { ultima: r1.ultima?.slice(0, 120) } });
  const r2 = await preguntar(ctx, s, 'Usá AskUserQuestion con multiSelect para preguntarme "¿Qué colores te gustan?" con opciones Rojo, Azul, Verde y Negro. Después respondé solo: COLORES <lista>.', ['Rojo', 'Azul', 'Negro'], 'multi');
  ctx.check('múltiple: llegan las 3 tildadas', /Rojo/.test(r2.ultima ?? '') && /Azul/.test(r2.ultima ?? '') && /Negro/.test(r2.ultima ?? '') && !/Verde/.test(r2.ultima ?? ''), { evidencia: r2.cap, datos: { ultima: r2.ultima?.slice(0, 120) } });
  const veces = await contarApariciones(s.pagina, '¿Qué colores te gustan?') - 1; // menos la del prompt
  ctx.check('la pregunta y la respuesta se ven una vez', veces <= 1, { evidencia: await ctx.captura(s, 'final'), datos: { pregunta: veces } });
}
