// Fase 6: subagentes en vivo. Dos subagentes en paralelo (guion
// `subagentes-paralelos`): cada uno muestra su tool en curso antes de que
// llegue su mensaje completo, cada uno tiene su propia tarjeta con su propio
// estado, cada tarjeta se cierra con el resultado de su propio subagente, y
// la respuesta principal (antes y después de delegar) no se parte ni se
// duplica por los eventos intercalados.
import { prepararHeadless, escribirYEnviar, esperarFin, nonce } from '../../lib/chat.mjs';
import { contarApariciones } from '../../lib/navegador.mjs';

export const meta = { descripcion: 'dos subagentes en paralelo: tool en curso, texto y resultado propios de cada uno', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:subagentes-paralelos nonce:${n}`);

  // Paso 1: a mitad del turno, cada tarjeta muestra la tool que su propio
  // subagente está usando — antes de que llegue el mensaje completo que la
  // resuelve (el guion deja la ventana de ~1,8 s abierta a propósito).
  let vistoBash = false;
  let vistoRead = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 8_000 && !(vistoBash && vistoRead)) {
    const txt = await s.pagina.locator('.chat-messages-pane').innerText().catch(() => '');
    vistoBash = vistoBash || /Bash/.test(txt);
    vistoRead = vistoRead || /Read/.test(txt);
    await s.pagina.waitForTimeout(100);
  }
  const capMitad = await ctx.captura(s, 'a-mitad');
  ctx.check(
    'a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo)',
    vistoBash && vistoRead,
    { evidencia: capMitad, datos: { vistoBash, vistoRead } },
  );

  // Pasos 2 y 3: cada subagente habla por su cuenta, en su propia tarjeta —
  // no una sola tarjeta compartida ni el texto de uno pisando al otro.
  let vistoTextoA = false;
  let vistoTextoB = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 10_000 && !(vistoTextoA && vistoTextoB)) {
    const txt = await s.pagina.locator('.chat-messages-pane').innerText().catch(() => '');
    vistoTextoA = vistoTextoA || txt.includes('Soy el subagente A');
    vistoTextoB = vistoTextoB || txt.includes('Soy el subagente B');
    await s.pagina.waitForTimeout(100);
  }
  const tarjetaA = await s.pagina.locator('.chat-message').filter({ hasText: 'Tarea A en paralelo' }).count();
  const tarjetaB = await s.pagina.locator('.chat-message').filter({ hasText: 'Tarea B en paralelo' }).count();
  const capParalelo = await ctx.captura(s, 'paralelo');
  ctx.check(
    'dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto',
    tarjetaA === 1 && tarjetaB === 1 && vistoTextoA && vistoTextoB,
    { evidencia: capParalelo, datos: { tarjetaA, tarjetaB, vistoTextoA, vistoTextoB } },
  );

  await esperarFin(s, t, 30_000);
  await s.pagina.waitForTimeout(500);

  // Paso 1 (cierre) y 4: cada tarjeta se cierra con el resultado de su propio
  // subagente — se abren para leer su "Result".
  await s.pagina.locator('.chat-message').filter({ hasText: 'Tarea A en paralelo' }).locator('button[aria-expanded]').first().click();
  await s.pagina.locator('.chat-message').filter({ hasText: 'Tarea B en paralelo' }).locator('button[aria-expanded]').first().click();
  await s.pagina.waitForTimeout(200);
  const capFinal = await ctx.captura(s, 'final');
  const resultadoA = await s.pagina.locator('.chat-message').filter({ hasText: 'Tarea A en paralelo' }).filter({ hasText: 'Resultado final de la tarea A' }).count();
  const resultadoB = await s.pagina.locator('.chat-message').filter({ hasText: 'Tarea B en paralelo' }).filter({ hasText: 'Resultado final de la tarea B' }).count();
  ctx.check(
    'cada tarjeta se cierra con el resultado de su propio subagente',
    resultadoA === 1 && resultadoB === 1,
    { evidencia: capFinal, datos: { resultadoA, resultadoB } },
  );

  // La respuesta principal (antes y después de delegar) no se parte ni se
  // duplica por los eventos de los subagentes intercalados en el medio.
  const apariciones = await contarApariciones(s.pagina, `[${n}]`);
  ctx.check(
    'la respuesta principal no se parte ni se duplica con subagentes de por medio',
    apariciones === 1,
    { evidencia: capFinal, datos: { apariciones } },
  );
}
