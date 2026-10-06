// Puntos 1 y 3: se ve que está pensando, antes del primer token y con el razonamiento en vivo.
import { prepararHeadless, escribirYEnviar, esperarFin, contarFilas, nonce } from '../../lib/chat.mjs';

export const meta = { descripcion: 'indicador y pensamiento (guion pensamiento: 1,5 s sin tokens, thinking a 80 ms, texto)', puerto: 3902 };

export async function correr(ctx) {
  const { s } = await prepararHeadless(ctx);
  const n = nonce();
  const t = await escribirYEnviar(s, `guion:pensamiento nonce:${n}`);
  await s.pagina.waitForTimeout(700);
  const cap = await ctx.captura(s, 'antes-del-primer-token');
  // El indicador: cualquier elemento visible con aria-live/role=status o texto de actividad, fuera de los mensajes.
  const indicador = await s.pagina.evaluate(() => {
    const cands = [...document.querySelectorAll('[role=status], [aria-live], [class*=ctivity], [class*=hinking], [class*=ndicator]')]
      .filter((el) => el.offsetParent !== null && el.innerText.trim());
    return cands.map((el) => el.innerText.trim().slice(0, 60));
  });
  ctx.check('hay un indicador de actividad visible antes del primer token', indicador.length > 0, { evidencia: cap, datos: { indicador } });
  // Cuándo se ve el razonamiento y cuándo la respuesta.
  let tRazon = null; let tResp = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000 && (tRazon === null || tResp === null)) {
    const txt = await s.pagina.locator('.chat-messages-pane').innerText().catch(() => '');
    if (tRazon === null && txt.includes('Estoy pensando')) tRazon = Date.now() - t;
    if (tResp === null && txt.includes('Respuesta después')) tResp = Date.now() - t;
    if (tRazon !== null && tResp === null && !ctx._capR) ctx._capR = await ctx.captura(s, 'razonamiento-en-vivo');
    await s.pagina.waitForTimeout(100);
  }
  // El guion piensa entre ~1,5 s y ~2,6 s después del envío: verlo antes de 2,3 s
  // es verlo mientras llega, no cuando el bloque ya terminó.
  ctx.check('el razonamiento se ve mientras se genera (≤ 2,3 s)', tRazon !== null && tRazon <= 2300, { evidencia: ctx._capR, datos: { tRazon, tResp } });
  const deltas = s.frames.filter((f) => f.t >= t && (f.datos?.kind === 'thinking_delta' || (f.datos?.kind === 'stream_delta' && f.datos?.thinking))).length;
  ctx.check('el server reenvía deltas de pensamiento', deltas > 0, { datos: { deltas } });
  await esperarFin(s, t, 20_000);
  await s.pagina.waitForTimeout(1500);
  ctx.check('la respuesta final aparece una vez', (await contarFilas(s, `[${n}]`)) === 1, { evidencia: await ctx.captura(s, 'final') });

  // --- Fase 5, paso 7: nombre de la tool mientras corre, y reaparición tras
  // 800 ms sin texto nuevo. El guion `herramienta` arranca con un `tool_use`
  // (Bash) sin texto antes, deja una ventana de 5,2 s sin ningún delta (la
  // tool "corriendo" — larga a propósito, para salir de los primeros 4 s de
  // cualquier turno, donde "Thinking…" sale igual por rotación) y después un
  // texto con un hueco intermedio de ~950 ms.
  const n2 = nonce();
  const t2 = await escribirYEnviar(s, `guion:herramienta nonce:${n2}`);
  const indicadorHerramienta = s.pagina.locator('.chat-activity-tab').first();

  // Dentro de la ventana en que la tool "corre" sin emitir nada: el indicador
  // tiene que estar visible desde antes de cualquier token y decir el nombre
  // de la tool, no la palabra genérica rotando.
  await s.pagina.waitForTimeout(400);
  const capTool = await ctx.captura(s, 'herramienta-durante-la-tool');
  const visibleDuranteTool = await indicadorHerramienta.isVisible().catch(() => false);
  const textoDuranteTool = await indicadorHerramienta.innerText().catch(() => '');
  ctx.check(
    '(herramienta) el indicador está visible antes del primer token',
    visibleDuranteTool,
    { evidencia: capTool, datos: { textoDuranteTool } },
  );
  ctx.check(
    'el indicador muestra el nombre de la tool mientras corre',
    /Bash/.test(textoDuranteTool),
    { evidencia: capTool, datos: { textoDuranteTool } },
  );

  // Desde el último delta de texto real (frame WS, no un reloj a ojo), ¿cuánto
  // tarda el indicador en volver a pinearse en "Thinking…" (locale por
  // defecto de un usuario de prueba sin preferencia guardada, ver
  // `src/modules/i18n/config.ts`)? Tiene que ser al menos los 800 ms del gap
  // (`ACTIVITY_GAP_MS` en `useChatRealtimeHandlers.ts`), no una coincidencia
  // de la rotación genérica.
  let tReaparece = null;
  let capReaparece = null;
  const t0h = Date.now();
  while (Date.now() - t0h < 15_000 && tReaparece === null) {
    const txt = await indicadorHerramienta.innerText().catch(() => '');
    const ultimoDelta = s.frames
      .filter((f) => f.t >= t2 && f.datos?.kind === 'stream_delta')
      .map((f) => f.t)
      .pop();
    if (ultimoDelta && /^Thinking/.test(txt)) {
      tReaparece = Date.now() - ultimoDelta;
      capReaparece = await ctx.captura(s, 'herramienta-reaparece-tras-hueco');
    }
    await s.pagina.waitForTimeout(50);
  }
  ctx.check(
    'tras ≥800 ms sin texto nuevo, el indicador vuelve a verse ("Thinking…")',
    tReaparece !== null && tReaparece >= 800,
    { evidencia: capReaparece, datos: { tReaparece } },
  );

  await esperarFin(s, t2, 20_000);
  await s.pagina.waitForTimeout(1000);
  ctx.check(
    '(herramienta) la respuesta final aparece una vez',
    (await contarFilas(s, `[${n2}]`)) === 1,
    { evidencia: await ctx.captura(s, 'herramienta-final') },
  );
}
