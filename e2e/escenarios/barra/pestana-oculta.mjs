// Paso 6 de la Fase 8: "ya existía" (el catch-up de `websocket_reconnected`
// en `useProjectsState.ts:~750`) — este escenario lo verifica en vivo en vez
// de darlo por sentado leyendo el código (regla de "Antes de dar algo por
// hecho" de CLAUDE.md).
//
// Qué hace y por qué, en vez de esperar los 5 minutos reales:
//
//  - El mecanismo que importa es el de `WebSocketContext.tsx`: un watchdog
//    cada 10 s que, si pasaron ≥ 70 s (`SILENCE_TIMEOUT_MS`) sin ningún
//    frame — ni el `heartbeat` del server, cada 25 s —, da por muerto el
//    socket (aunque sigue "abierto": el comentario del propio archivo
//    explica que `onclose` nunca llega en este caso) y lo recicla. Volver a
//    la pestaña y recuperar red son las otras dos señales, pero la causa
//    real que dispara algo es siempre el silencio de ≥ 70 s.
//  - Dos formas de simularlo NO funcionaron (quedan documentadas para no
//    repetir el intento):
//      1. Pisar `document.visibilityState`/despachar `visibilitychange` sin
//         cortar nada: Chromium headless sigue mandando los heartbeats
//         igual, `lastFrameAtRef` nunca envejece y no hay nada que reciclar.
//      2. `page.context().setOffline(true)`: medido en este Playwright/
//         Chromium, NO corta una conexión WebSocket ya abierta (solo bloquea
//         tráfico nuevo) — el heartbeat de 25 s siguió llegando igual
//         durante los 90 s "offline" (ver `frames-0.json` de la primera
//         corrida: heartbeat recibido adentro de la ventana). Cero reciclado,
//         check en falso por una simulación que no simulaba nada.
//  - Lo que sí reproduce el silencio real: `page.routeWebSocket()` (Playwright
//    ≥ 1.48), registrado ANTES de navegar. Se conecta al server de verdad con
//    `connectToServer()` y reenvía los mensajes en los dos sentidos — pero
//    con una compuerta (`forwarding`) que, al apagarse, deja de reenviar
//    cualquier frame sin cerrar la conexión ni avisarle a nadie: exactamente
//    "readyState sigue OPEN, pero no llega nada", que es la situación que el
//    propio comentario de `WebSocketContext.tsx` describe.
//  - El archivado pasa TEMPRANO dentro de la ventana muda (con un `fetch`
//    desde Node, no desde la página) — no al final. Si pasara al final, el
//    reciclado automático por silencio (que dispara solo, sin que este
//    escenario lo pida) ya habría hecho su refresco de alcance ANTES de que
//    existiera nada nuevo que atrapar, y el check daría falso por una
//    carrera propia, no por el bug que mide. Con el archivado temprano, pase
//    lo que pase con la conexión mientras tanto, el refresco que importa —
//    el que agarra el `websocket_reconnected`, disparado solo por el
//    watchdog de 70 s sin que este escenario lo fuerce — lo va a encontrar
//    ya archivado.
//  - `websocket_reconnected` nunca es un frame de red: `WebSocketContext.tsx`
//    lo sintetiza en el cliente dentro de `onopen` (`dispatch({ kind:
//    'websocket_reconnected', ... })`), así que nunca lo va a atrapar
//    `s.frames` (que mide tráfico de verdad sobre el socket, no lo que
//    efectivamente proceso el handler `onmessage` de la página — primer
//    intento de este escenario, con `page.context().setOffline`, medía
//    frames reales igual aunque la compuerta de la página los descartara).
//    La prueba de que reconectó y se puso al día es indirecta pero
//    inequívoca, dado el código leído: la única llamada a `/api/projects`
//    después de abrir la página es la de `refreshProjectsSilently()`, que
//    solo dispara `websocket_reconnected` (`useProjectsState.ts:~750`) — no
//    hay ningún polling propio. Por eso el escenario cuenta esos pedidos.
import { filaProyecto, mostrarTodasLasSesiones, nonce, crearSesionFalsa } from '../../lib/chat.mjs';

export const meta = { descripcion: 'socket mudo ≥ 70 s (compuerta de WS, sin cerrar la conexión); al volver, la barra está al día', puerto: 3902 };

const SILENCIO_MS = 85_000; // SILENCE_TIMEOUT_MS (70s) + un watchdog entero (10s) + colchón.

export async function correr(ctx) {
  const n = nonce();
  const id = crearSesionFalsa(`guion:humo nonce:${n}`);
  const s = await ctx.abrir();

  // La compuerta: tiene que registrarse antes del primer `goto`, que es
  // cuando la app abre su WebSocket.
  let forwarding = true;
  await s.pagina.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => { if (forwarding) server.send(message); });
    server.onMessage((message) => { if (forwarding) ws.send(message); });
  });

  const pedidosProyectos = [];
  s.pagina.on('request', (req) => {
    if (req.method() === 'GET' && /\/api\/projects(\?|$)/.test(req.url())) pedidosProyectos.push(Date.now());
  });

  await s.pagina.goto(`${s.base}/`, { waitUntil: 'networkidle' });
  await mostrarTodasLasSesiones(s);
  await filaProyecto(s).click();

  const mia = () => filaProyecto(s).locator('xpath=following-sibling::div[1]').getByText(`Guion humo ${n}`).count();
  let antes = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 30_000 && !(antes = await mia())) await s.pagina.waitForTimeout(500);
  const capVisible = await ctx.captura(s, '1-visible-antes-de-silenciar');

  // "Pestaña oculta": además de la compuerta (lo que de verdad importa),
  // se marca la página como oculta — es una de las tres señales que
  // revisa el watchdog, aunque la causa real del reciclado es el silencio.
  await s.pagina.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  forwarding = false;
  const tSilencio = Date.now();

  // Temprano a propósito — ver la nota de arriba sobre la carrera con el
  // reciclado automático.
  const statusArchivar = await fetch(`${s.base}/api/providers/sessions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${s.token}` },
  }).then((r) => r.status).catch((e) => `error: ${e.message}`);

  const capMuda = await ctx.captura(s, '2-muda-recien-archivada').catch(() => null);

  await s.pagina.waitForTimeout(SILENCIO_MS);

  forwarding = true;
  await s.pagina.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const tVuelta = Date.now();
  let tBaja = null;
  while (Date.now() - tVuelta < 30_000 && tBaja === null) {
    if ((await mia()) < antes) tBaja = Date.now() - tVuelta;
    else await s.pagina.waitForTimeout(300);
  }

  const hayRefrescoDeCatchUp = pedidosProyectos.some((t) => t > tSilencio);

  ctx.check(
    'socket mudo ≥ 70 s (sin cerrarse): al volver, la barra refleja lo que pasó mientras estaba muda, sin recargar',
    statusArchivar === 200 && antes === 1 && tBaja !== null && hayRefrescoDeCatchUp,
    {
      evidencia: [capVisible, capMuda, await ctx.captura(s, '3-vuelta-al-dia')].filter(Boolean),
      datos: { statusArchivar, antes, tBajaMs: tBaja, hayRefrescoDeCatchUp, silencioMs: SILENCIO_MS },
    },
  );
}
