// Fase 9, paso 1: AskUserQuestion tiene que esperar a la UI en los tres modos
// de permiso — no solo en `default`. En `auto` y `bypassPermissions` el SDK
// resuelve la aprobación en el paso de permission-mode y salta `canUseTool`
// por completo (esa es la línea base, antes de esta fase: la pregunta se
// contestaba sola, sin pasar por la pantalla). El hook `PreToolUse` que
// agrega `claude-runtime.provider.js` corre antes de ese paso y, si devuelve
// una decisión explícita, lo saltea en cualquier modo — así que con el hook
// puesto la pregunta tiene que llegar a la UI diga lo que diga el modo.
//
// El guion `pregunta` del CLI falso reproduce las dos ramas (ver
// claude-falso.mjs): si el host registró el hook, lo usa (la corrección); si
// no lo registró y el modo es `auto`/`bypassPermissions`, se autocontesta
// con la primera opción de cada pregunta sin pedir nada (la línea base). Por
// eso, revertir el hook de `claude-runtime.provider.js` (sin tocar este
// archivo) tiene que poner este escenario en rojo para `auto` y
// `bypassPermissions` — y seguir en verde para `default`, que nunca pasó por
// `canUseTool` saltado.
import { crearSesionFalsa, abrirSesion, escribirYEnviar, esperarFin } from '../../lib/chat.mjs';

export const meta = {
  descripcion: 'AskUserQuestion llega a la UI en default, auto y bypassPermissions',
  puerto: 3902,
  checks: [
    'default: la pregunta llega y Claude repite lo elegido',
    'auto: la pregunta llega y Claude repite lo elegido',
    'bypassPermissions: la pregunta llega y Claude repite lo elegido',
  ],
};

async function contestarYVerificar(ctx, s, modo) {
  const t = await escribirYEnviar(s, 'guion:pregunta');
  const btn = (texto) => s.pagina.getByRole('button', { name: new RegExp(`^\\s*\\d*\\s*${texto}`) }).last();
  // La señal de "llegó a la UI" tiene que ser el panel interactivo en sí
  // (un botón "Azul" que se puede clickear), no el texto de la pregunta: una
  // vez contestada, la tarjeta del transcript también muestra ese texto (ver
  // QuestionAnswerContent, Fase 9 paso 4), así que buscar el texto a secas no
  // distingue "esperó a que yo elija" de "ya se autocontestó y por eso lo
  // único que hay es el resumen". Con la línea base (sin el hook, en
  // auto/bypassPermissions) este botón nunca aparece: la pregunta se
  // resuelve sola, sin mandar ningún `permission_request`.
  const vio = await btn('Azul').waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  const cap = await ctx.captura(s, `${modo}-pregunta`);
  ctx.check(`${modo}: la pregunta llega a la UI (no se contesta sola)`, vio, { evidencia: cap });
  if (!vio) {
    ctx.check(`${modo}: Claude repite exactamente lo elegido`, false, { datos: { motivo: 'la pregunta nunca llegó: no hay nada que elegir' } });
    return;
  }
  await btn('Azul').click();
  await s.pagina.getByRole('button', { name: /Next/ }).click();
  await btn('Manzana').click();
  await s.pagina.waitForTimeout(100);
  await btn('Uva').click();
  await s.pagina.getByRole('button', { name: /Next/ }).click();
  await btn('Sí').click();
  await s.pagina.getByRole('button', { name: /Submit/ }).click();
  await esperarFin(s, t, 20_000);
  await s.pagina.waitForTimeout(2000);
  const eco = await s.pagina.locator('.chat-messages-pane').innerText();
  const linea = (eco.match(/Elegiste: [^\n]*/g) || []).pop() ?? '';
  ctx.check(`${modo}: Claude repite exactamente lo elegido`, /Azul/.test(linea) && /Manzana/.test(linea) && /Uva/.test(linea) && /Sí/.test(linea) && !/Pera|Rojo|Verde|No\b/.test(linea), { datos: { linea }, evidencia: await ctx.captura(s, `${modo}-respondida`) });
}

// `default` no necesita ningún truco: es el modo con el que arranca toda
// sesión nueva. `auto`/`bypassPermissions` se fijan en localStorage antes de
// abrir la sesión — mismo mecanismo que usa `ComposerPermissionMenu`
// (`useChatProviderState.ts`: lee `permissionMode-<sessionId>` al montar) —
// así el próximo `chat.send` manda ese modo sin tocar la UI del menú, que es
// la Fase 11 de otro agente.
async function prepararSesionConModo(s, modo) {
  const id = crearSesionFalsa(`guion:humo nonce:modos-${modo}`);
  if (modo !== 'default') {
    await s.pagina.addInitScript(([sid, m]) => localStorage.setItem(`permissionMode-${sid}`, m), [id, modo]);
  }
  await abrirSesion(s, id);
  return { id };
}

export async function correr(ctx) {
  const s = await ctx.abrir();
  for (const modo of ['default', 'auto', 'bypassPermissions']) {
    await prepararSesionConModo(s, modo);
    try {
      await contestarYVerificar(ctx, s, modo);
    } catch (e) {
      // Un modo que revienta (p. ej. clickear un botón que nunca apareció)
      // no puede tapar a los otros dos: cada modo es su propio veredicto.
      ctx.check(`${modo}: Claude repite exactamente lo elegido`, false, { datos: { motivo: String(e.message).split('\n')[0] }, evidencia: await ctx.captura(s, `${modo}-excepcion`).catch(() => undefined) });
    }
  }
}
