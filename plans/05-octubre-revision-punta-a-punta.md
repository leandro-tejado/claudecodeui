# Revisión de punta a punta de CloudCLI: que los mensajes lleguen bien y se vea como Optimum

**Fecha:** 05 de Octubre 2026
**Estado:** en-ejecucion

Se revisa y se verifica en un navegador real todo lo que Leandro sigue viendo roto en CloudCLI: el streaming partido o de golpe, el "pensando" que no aparece, los subagentes invisibles, la cuota en "sin dato", la barra que no se actualiza, el cuestionario feo y que contesta mal, y las sesiones de tmux que se traban. Después se rediseña con el lenguaje del chat `/claude` de Optimum, que hicimos nosotros y anda bien. Cada arreglo se cierra con evidencia de Playwright contra el servicio corriendo, no con tests unitarios.

---

## Contexto

Hoy se hicieron siete commits para estos síntomas (`1329d865`, `ed997afa`, `36795114`, `62d63c69`, `4158e887`, `8267cbe1`, `373dc739`) y Leandro los sigue viendo. Los tests unitarios pasaban, pero nadie miró el resultado en un navegador. Este plan **no da nada por bueno**: arranca reproduciendo cada síntoma con evidencia, arregla las causas raíz encontradas en la lectura del 5-oct y cierra cada punto con una captura o un log.

### Por qué en Optimum anda y acá no (diagnóstico del 5-oct, verificado en el código)

| | Optimum (`servidor-code` + `ChatClaude.tsx`) | CloudCLI |
|---|---|---|
| Transporte | SSE por `POST /mensaje` | WebSocket con replay por `seq` (tope de 5000 eventos por run, `chat-run-registry.service.ts:51`) |
| Fuente del texto | **Una sola**: los deltas se concatenan sobre el turno; el mensaje completo solo sirve de respaldo si no llegó ningún delta (`ChatClaude.tsx:905-912`) | **Dos** sin id que las una: deltas en `__streaming_<sid>` y después el `text` final con otro id. Se deduplican comparando texto (`useSessionStore.ts:240-361`) |
| Key de React | `key={i}`, estable | Incluye el `timestamp`, y `updateStreaming` lo renueva en cada volcado de 100 ms (`useSessionStore.ts:995`). **La fila se remonta 10 veces por segundo**: por eso el texto entra a saltos y el final aparece de golpe |
| Pensamiento | `thinking: {type:'adaptive', display:'summarized'}` (`server.mjs:851`) y reenvía `thinking_delta` | No configura `thinking`. El normalizador solo deja pasar `delta.text` (`claude-sessions.provider.ts:1094`) e ignora `content_block_start` |
| "Pensando" | Línea de actividad con el nombre de la tool; reaparece tras 800 ms sin texto (`revelado.ts:144-156`) | Una pestaña genérica con palabras rotando (`composer/ActivityIndicator.tsx`) que no sabe qué pasa |
| Visual | Sans única (`system-ui`), un acento navy, Claude sin burbuja, columna `max-w-3xl`, casi sin cromo de tools | Merriweather serif en las respuestas + Encode Sans en la UI, burbujas con avatar, tarjetas de tool por todos lados |

**`1329d865` cubre un solo camino.** Exime a `task_status` de cerrar el bloque, pero un mensaje de subagente, un `error` de stderr o un `task_notification` a mitad del bloque lo siguen cerrando. `dropStreamFragmentsOf` se corta en la primera fila que no es fragmento y el duplicado vuelve.

### Por qué fallan las sesiones de tmux (verificado en el código)

- **"Se queda esperando"**: el fin de turno lo marca `manejarActualizacionTranscript` (`tmux-bridge.service.ts:772-813`). `complecionAnunciada` solo vuelve a `false` si un poll ve el turno **sin terminar**. El watcher hace polling cada **6 s** (`sessions-watcher.service.ts:264-265`). Una respuesta de menos de ~6 s se ve ya terminada y nunca sale el `complete`.
- **"El mensaje sale dos veces y se traba"**: con la UI pegada en "esperando", el siguiente mensaje va a la cola del servidor. `scheduled-message-dispatcher.service.ts` lo despacha con `runDetachedChatTurn`, que no tiene ningún chequeo de tmux: arranca un `claude --resume` por SDK sobre la misma sesión con el REPL del pane vivo (dos procesos escribiendo el mismo transcript). Hay otras dos vías: la caída a `chat.send` tras un error `TMUX_*` (`useChatRealtimeHandlers.ts:200-202`) y un falso `no-salio` que devuelve el texto al composer.
- **"No muestra que está pensando / manda todo de golpe"**: la respuesta sale solo del JSONL, por bloque y cada 6 s. Del pane no se lee nada mientras Claude trabaja.
- **Mensajes con el turno en curso**: Claude Code los guarda como `attachment{type:"queued_command"}`. El repo no los conoce, así que el eco nunca se reconcilia.

### Por qué el cuestionario repite y contesta mal

- **Se ve dos veces**: la tarjeta `tool_use` del transcript (abierta, con todas las opciones) y el panel o tarjeta tmux muestran la misma pregunta a la vez. En tmux, el `tool_use` se emite sin respuestas y no se reemite (corte por cantidad, `tmux-bridge.service.ts:789-790`).
- **Selección que no se registra**: en tmux, la huella del diálogo incluye lo tildado (`tmux-prompt.service.ts:299-306`). Un segundo clic antes del refresco llega con la huella vieja y da `TMUX_PROMPT_STALE` sin avisar. En headless, en modo `auto` o `bypassPermissions` el SDK no llama a `canUseTool` y la pregunta se contesta sola (`claude-runtime.provider.js:1089-1095`).
- **Historial**: `message-unification.ts:139-178` saca las respuestas con la regex `"([^"]+)"="([^"]*)"`, que se rompe si la pregunta lleva comillas.

### Por qué la cuota dice "sin dato"

`usage-window.service.ts:131-170` lee `~/.cache/aos/cuota.json` **una sola vez por proceso**: después depende de un `rate_limit_event` de un turno de CloudCLI. Si no hay turnos en 15 min, la lectura vence y se muestra "sin dato", aunque el archivo tenga datos de hace 4 s porque la statusline de cualquier REPL lo escribe. Tampoco hay re-broadcast. `servidor-code` relee el archivo en cada consulta (`limites.mjs:38,83-112`).

### Barra lateral

Las sesiones nuevas del orquestador llegan por polling de 3 s sobre `~/.cache/aos` + debounce de 0,5-2 s (`sessions-watcher.service.ts:291-319`). En teoría aparecen en 3-5 s. Leandro dice que no: hay que medirlo antes de tocar nada.

### Decisiones de Leandro (5-oct)

| Tema | Decisión |
|---|---|
| Tmux en vivo | **Pane en vivo + JSONL**: se lee el pane cada ~400 ms para el estado (pensando, tool en curso) y el texto escribiéndose. El JSONL, con inotify en vez de polling de 6 s, queda como versión final y reemplaza al borrador. |
| Streaming headless | **Mismo modelo de Optimum, sobre WebSocket**: deltas con id de mensaje + índice de bloque, una fila por bloque con key estable, `thinking` summarized y `content_block_start` reenviados. Se borra la deduplicación por texto. Se mantienen el replay, las varias pestañas y la reconexión. |
| Ejemplo del cuestionario | Leandro lo pasa **en la fase del cuestionario**. Esa fase queda bloqueada hasta tenerlo; el resto avanza. |
| E2E | **Instancia de prueba + `:3001` al final.** Se itera contra una instancia paralela (`:3901`, `auth.db` propia, mismo build y mismo `~/.claude`, sesiones descartables `e2e-*`). Después del reinicio que hace Leandro, una pasada final contra `:3001` con su login cargado por él en una variable de entorno, solo para esa corrida. |

### Valores por defecto (no preguntados; se corrigen si hace falta)

- **Turnos reales con el prompt más chico posible** ("respondé solo OK", "contá del 1 al 40 de a uno por renglón"), en sesiones `e2e-*` dentro de un proyecto descartable `/tmp/cloudcli-e2e/proyecto`. Para los escenarios que no se pueden forzar con un modelo real (subagente a mitad de bloque, stderr a mitad del run, más de 5000 eventos), se usa un **CLI falso** con guion fijo en una segunda instancia (`:3902`, `CLAUDE_CLI_PATH`).
- **Evidencia en git**: `e2e/evidencia/<fase>/` con un `informe.md` por fase y las capturas PNG (390 px y 1280 px). Las trazas y los videos de Playwright quedan gitignoreados.
- **Nada de Leandro se toca**: ninguna sesión que no empiece con `e2e-`, ni `web`, ni `orquestador`. El teardown cierra solo lo que creó, y verifica que no queda ningún `e2e-*` vivo.
- **El reinicio de `:3001` lo hace Leandro** (`npm run build && systemctl --user restart cloudcli` desde `ct` o ttyd), nunca este agente.

---

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `e2e/` (nuevo) | crear: arnés Playwright, instancia de prueba, CLI falso, escenarios por punto, evidencia |
| `package.json` | modificar: `playwright-core` como devDependency y scripts `e2e:*` |
| `.gitignore` | modificar: trazas y videos de `e2e/`, `/tmp` de la instancia |
| `server/modules/usage-window/services/usage-window.service.ts` | modificar: releer `cuota.json` siempre, gana la lectura más nueva |
| `server/modules/usage-window/services/usage-window-cuota-file.service.ts` | modificar: ruta por env (`RUTA_CUOTA_JSON`), `fs.watch` + broadcast |
| `src/modules/usage-window/*` | modificar: nunca "sin dato" si hay lectura; mostrar antigüedad; refetch al volver a la pestaña |
| `server/modules/providers/list/claude/claude-sessions.provider.ts` | modificar: `stream_delta` con `messageId` + `blockIndex`, `thinking_delta`, `activity` desde `content_block_start` |
| `server/modules/providers/list/claude/claude-runtime.provider.js` | modificar: `thinking` summarized; actividad de subagentes; AskUserQuestion en cualquier modo de permisos |
| `server/modules/websocket/services/chat-run-registry.service.ts` | modificar: coalescer deltas del mismo bloque para no llegar al tope de 5000 |
| `src/modules/chat/hooks/useSessionStore.ts` | modificar: una fila por bloque con id estable; borrar la dedupe por texto |
| `src/modules/chat/hooks/useChatRealtimeHandlers.ts` | modificar: manejo de eventos nuevos; sin caída a `chat.send` en sesiones tmux |
| `src/modules/chat/utils/messageKeys.ts`, `ChatMessagesPane.tsx` | modificar: key = id del mensaje |
| `server/modules/websocket/services/tmux-bridge.service.ts` | modificar: fin de turno por id de fila user; corte por id; lector del pane |
| `server/modules/providers/services/sessions-watcher.service.ts` | modificar: inotify (`fs.watch`) para transcripts y para `~/.cache/aos`; polling solo de respaldo |
| `server/modules/scheduled-messages/services/scheduled-message-dispatcher.service.ts` + `chat-websocket.service.ts` (`runDetachedChatTurn`, `handleChatSend`) | modificar: nunca resumir por SDK una sesión con pane vivo |
| `server/modules/websocket/services/tmux-prompt.service.ts` | modificar: selección compuesta en el cliente y enviada de una vez; huella sin lo tildado |
| `server/shared/message-unification.ts` | modificar: respuestas desde `toolUseResult` JSON, no por regex |
| `src/modules/chat/composer/TmuxPromptBanner.tsx`, `PermissionRequestsBanner.tsx`, `AskUserQuestionPanel.tsx` | reemplazar: un único componente `Cuestionario` con dos adaptadores (headless y tmux) |
| `src/modules/chat/transcript/MessageComponent.tsx`, `tailwind.config.js`, `src/index.css` | modificar: lenguaje visual nuevo |
| `design-system/{README,branding,typography,tokens}.md` (nuevos) | crear: design system persistido |
| `design-system/visual-refs/05-octubre-*.html` (nuevos) | crear: bocetos del recorrido entero |
| `docs/actualizacion-en-vivo.md` (nuevo) | crear: inventario de qué componente se actualiza con qué evento |

---

## Micro-tasks

- [x] Agregar `playwright-core@1.63.0` como devDependency y apuntar al `chromium_headless_shell-1243` de `~/.cache/ms-playwright` — acepta: `node e2e/humo.mjs` abre `about:blank` y saca una captura | valida: `NODE_ENV=development npm i -D playwright-core@1.63.0 && node e2e/humo.mjs`
- [x] Script `e2e/instancia.mjs` que levanta el `dist/` actual en `:3901` con `DATABASE_PATH=/tmp/cloudcli-e2e/auth.db`, registra el usuario de prueba y guarda el token — acepta: `curl :3901/api/auth/status` responde `needsSetup:false` y el token sirve en `/api/auth/user` | valida: `node e2e/instancia.mjs up && curl -s 127.0.0.1:3901/api/auth/status`
- [x] Helpers `e2e/sesiones.mjs`: crear y cerrar sesiones `e2e-*` (headless por la UI, tmux por `orquestar.py crear`), con teardown que se niega a tocar nada sin prefijo — acepta: después del teardown, `tmux ls | grep -c '^e2e-'` = 0 y las sesiones de Leandro siguen idénticas | valida: `node e2e/sesiones.mjs prueba-teardown`
- [x] CLI falso `e2e/claude-falso.mjs` con guiones (`subagente-a-mitad`, `stderr-a-mitad`, `6000-deltas`, `pensamiento`, `pregunta`) y una instancia `:3902` con `CLAUDE_CLI_PATH` — acepta: un turno en `:3902` reproduce el guion entero sin gastar cuota | valida: `node e2e/correr.mjs falso/humo`
- [x] Línea base: correr los escenarios de los 8 puntos y de los 7 commits de hoy contra el código actual — acepta: `e2e/evidencia/00-linea-base/informe.md` con una fila por check (pasa/falla + captura o log) | valida: `node e2e/correr.mjs linea-base`
- [x] Cuota: releer `cuota.json` en cada `getUsageWindow` y quedarse con la lectura más nueva; ruta por `RUTA_CUOTA_JSON` — acepta: test de server verde | valida: `NODE_ENV=test npm test -- usage-window`
- [x] Cuota: `fs.watch` sobre el archivo → `scheduleUsageWindowBroadcast` — acepta: escribir el archivo cambia el header abierto en ≤ 3 s sin recargar | valida: `node e2e/correr.mjs cuota/en-vivo`
- [x] Cuota en el cliente: nunca "sin dato" si hay una lectura; antigüedad visible (> 15 min) y refetch al volver a la pestaña — acepta: con un archivo de hace 2 h, el header muestra los dos porcentajes y la antigüedad | valida: `node e2e/correr.mjs cuota/vieja`
- [x] Protocolo: `stream_delta` con `messageId` + `blockIndex`; eventos `thinking_delta` y `activity` (`pensando` / `tool:<nombre>`) — acepta: test del normalizador con los `stream_event` reales grabados de un turno | valida: `NODE_ENV=test npm test -- claude-sessions`
- [x] `thinking: {type:'adaptive', display:'summarized'}` en `query()` cuando el modelo lo soporta — acepta: un turno real con Sonnet trae `thinking_delta` con texto | valida: `node e2e/correr.mjs headless/pensamiento`
- [x] Coalescer los deltas del mismo bloque en el replay — acepta: un run de 6000 deltas, reconectado a mitad, se rearma sin `history_truncated` y sin duplicados | valida: `node e2e/correr.mjs falso/6000-deltas`
- [x] Store del cliente: una fila por `(messageId, blockIndex)`, key = id; el `text` final reemplaza el contenido de esa fila; borrar `dropStreamFragmentsOf`, `isEchoOfFullText` y `dedupeAdjacentAssistantEchoes` — acepta: vitest verde y cero referencias a esas tres funciones | valida: `NODE_ENV=test npx vitest run && ! grep -rn "dropStreamFragmentsOf\|isEchoOfFullText\|dedupeAdjacentAssistantEchoes" src`
- [x] Tipeo real: la fila en streaming no se remonta — acepta: en un turno real, el largo del texto visible crece en ≥ 5 muestras distintas y el nodo DOM es el mismo de principio a fin | valida: `node e2e/correr.mjs headless/tipeo`
- [x] Indicador de actividad estilo Optimum (tool en curso, "pensando", reaparece tras 800 ms sin texto) — acepta: captura con el indicador antes del primer token y durante una tool | valida: `node e2e/correr.mjs headless/actividad`
- [x] Sin partidos ni duplicados en los guiones `subagente-a-mitad` y `stderr-a-mitad` — acepta: exactamente una fila por bloque y el texto igual al final | valida: `node e2e/correr.mjs falso/intercalados`
- [x] Subagentes en vivo: la tarjeta de la tool Agent/Task muestra la actividad del subagente mientras corre (tool en curso, texto) — acepta: captura a mitad del subagente con su actividad, en headless real | valida: `node e2e/correr.mjs headless/subagente`
- [x] Tmux: fin de turno por id de la última fila user (no por el flag `complecionAnunciada`) — acepta: un turno "respondé solo OK" pasa a libre en ≤ 3 s, 10 de 10 veces | valida: `node e2e/correr.mjs tmux/turno-corto`
- [x] Tmux: inotify sobre el JSONL y corte por id en vez de por cantidad — acepta: la primera fila llega en ≤ 1,5 s desde que se escribe | valida: `node e2e/correr.mjs tmux/latencia`
- [x] Tmux: lector del pane cada ~400 ms → `activity` (spinner, tool) y borrador de texto — acepta: "pensando" visible ≤ 2 s después de "Enviado"; texto creciendo en ≥ 3 muestras; el borrador lo reemplaza la versión del JSONL sin dejar dos filas | valida: `node e2e/correr.mjs tmux/en-vivo`
- [ ] Tmux: la cola y el dispatcher nunca resumen por SDK una sesión con pane vivo; sin caída a `chat.send` tras `TMUX_*` — acepta: test de server + E2E con 5 mensajes seguidos (2 durante el turno): cada uno aparece exactamente 1 vez en el pane y en el JSONL, y hay un solo proceso `claude` en la sesión | valida: `node e2e/correr.mjs tmux/rafaga`
- [ ] Tmux: `queued_command` se reconcilia como mensaje del usuario — acepta: el mensaje enviado con el turno en curso se ve una vez y con estado "Enviado" | valida: incluido en `tmux/rafaga`
- [x] Tmux: el ack de `chat.subscribe` trae el estado real del pane — acepta: recargar a mitad de un turno mantiene el indicador | valida: `node e2e/correr.mjs tmux/recarga`
- [x] Barra: `fs.watch` sobre `~/.cache/aos/sesiones.json` — acepta: `orquestar.py crear e2e-orq ejecutora /tmp/cloudcli-e2e/proyecto` aparece en la barra abierta en ≤ 3 s sin recargar | valida: `node e2e/correr.mjs barra/orquestador`
- [x] Inventario `docs/actualizacion-en-vivo.md`: cada componente con estado del servidor, su fuente de actualización y si es en vivo — acepta: tabla completa y cero filas "ninguna" sin justificar | valida: lectura + `node e2e/correr.mjs barra/componentes`
- [ ] Cuestionario headless en los modos `default`, `auto` y `bypassPermissions` — acepta: en los tres modos la pregunta llega a la UI y Claude recibe la respuesta elegida (la repite literal) | valida: `node e2e/correr.mjs pregunta/modos`
- [ ] Cuestionario tmux: la selección se compone en el cliente y se teclea de una vez; la huella no incluye lo tildado — acepta: 3 casillas marcadas con clics a 100 ms de distancia llegan las 3 | valida: `node e2e/correr.mjs pregunta/tmux-multi`
- [ ] Una sola representación de la pregunta: pendiente = cuestionario; respondida = resumen Pregunta → Respuesta, una vez — acepta: cero textos de pregunta repetidos en el DOM antes y después de contestar, en headless y en tmux | valida: `node e2e/correr.mjs pregunta/sin-repetidos`
- [ ] Respuestas del historial desde `toolUseResult`, no por regex — acepta: una pregunta con comillas se muestra bien tras recargar | valida: `NODE_ENV=test npm test -- message-unification`
- [x] Recibir de Leandro el prompt de ejemplo del cuestionario (lo propuso el orquestador, por decisión de Leandro) — acepta: guardado en `design-system/visual-refs/05-octubre-cuestionario-ejemplo.md` | valida: el archivo existe
- [x] Design system persistido (`design-system/README.md`, `branding.md`, `typography.md`, `tokens.md`) a partir de Optimum + `apple-design` + `ui-ux-pro-max --design-system` — acepta: los cuatro archivos existen con hex, escala y tokens concretos | valida: `ls design-system/*.md`
- [x] Boceto del chat (recorrido: barra → sesión → enviar → pensando → tool → subagente → respuesta escribiéndose → fin) — acepta: OK de Leandro por AskUserQuestion | valida: `design-system/visual-refs/05-octubre-chat.html`
- [x] Boceto del cuestionario (simple, múltiple, "Otra", revisión, enviado, resumen; headless y tmux; 1280 y 390, claro y oscuro) — acepta: OK de Leandro | valida: `design-system/visual-refs/05-octubre-cuestionario.html`
- [x] Boceto del header de cuota y de la barra lateral — acepta: OK de Leandro | valida: `design-system/visual-refs/05-octubre-header-barra.html`
- [ ] Implementar el lenguaje visual del chat (sans única, Claude sin burbuja, columna de lectura, actividad en una línea con detalle plegable) — acepta: capturas 390/1280 × claro/oscuro iguales al boceto aprobado | valida: `node e2e/correr.mjs visual/chat`
- [ ] Implementar `Cuestionario` (un componente, dos adaptadores) — acepta: los escenarios de `pregunta/*` siguen verdes con el componente nuevo | valida: `node e2e/correr.mjs pregunta`
- [ ] Implementar el header y la barra rediseñados — acepta: capturas iguales al boceto; cuota y barra en vivo siguen verdes | valida: `node e2e/correr.mjs visual/header-barra cuota barra`
- [ ] Accesibilidad: objetivos de toque de 44 px, foco visible, contraste 4,5:1, `prefers-reduced-motion` — acepta: auditoría axe sin violaciones serias en chat y cuestionario | valida: `node e2e/correr.mjs a11y`
- [ ] Suite completa verde en `:3901` y `:3902` — acepta: `e2e/evidencia/final-3901/informe.md` con todos los checks en pasa | valida: `node e2e/correr.mjs todo`
- [ ] Leandro reinicia `:3001`; pasada final con su login por variable de entorno — acepta: `e2e/evidencia/final-3001/informe.md` todo en pasa y Leandro confirma en el celular | valida: `CLOUDCLI_URL=http://100.77.186.53:3001 node e2e/correr.mjs todo --solo-lectura-de-leandro`
- [ ] Tests unitarios del repo verdes — acepta: los dos comandos salen con 0 | valida: `NODE_ENV=test npx vitest run && NODE_ENV=test npm test`
- [ ] Commit y push en `diseno/propio` de cada fase — acepta: `git status` limpio y `git log origin/diseno/propio` incluye el commit | valida: `git fetch && git status -sb`

---

## Análisis Crítico

> Completado por Claude en Fase 2.5. Leandro decide qué incorporar antes de ejecutar.

### Incongruencias detectadas
- **La instancia de prueba comparte `~/.claude` y `~/.cache/aos` con la de Leandro.** Una sesión `e2e-*` va a aparecer también en su barra de `:3001` mientras corre la suite. Se mitiga con el prefijo, el proyecto descartable y el teardown, pero no es invisible. Separar `HOME` obligaría a copiar las credenciales de Claude, y eso no se hace.
- **La limpieza automática de la barra (`ed997afa`, tope de 3 proyectos) puede archivar `/tmp/cloudcli-e2e/proyecto` a mitad de la suite** o, al revés, el proyecto de prueba puede desplazar uno de Leandro del top 3 durante una hora. Hay que excluir los proyectos bajo `/tmp/cloudcli-e2e/` de la regla del tope y archivarlos en el teardown.
- **Las fases 5, 7 y 9 tocan los mismos archivos del cliente** (`useSessionStore.ts`, `useChatRealtimeHandlers.ts`). En paralelo chocan. Por eso son secuenciales en el orden de ejecución, aunque el server de cada una podría ir aparte.
- **El borrador del pane (tmux) no tiene id de mensaje.** El JSONL sí. El reemplazo es "el borrador del turno en curso lo pisa la primera fila assistant nueva del JSONL", y se valida con el check de "sin dos filas". Un turno con varios bloques de texto separados por tools va a mostrar el borrador del bloque actual; los anteriores ya llegaron del JSONL.

### Huecos no cubiertos
- **La cuota "siempre fresca" depende de que alguna REPL escriba `cuota.json`.** Con todo quieto, el dato envejece aunque la notebook esté gastando (la cuota es de la cuenta). El plan muestra el último valor con su antigüedad, que es dato real, pero no lo refresca solo. La única fuente activa sería el endpoint OAuth de uso de Anthropic con el token de `~/.claude/.credentials.json`. Eso toca una credencial, así que queda en sugerencias y no entra sin tu OK.
- **El pane de Claude Code no es una API.** El parser del spinner y del texto depende del formato de la TUI. Si se actualiza Claude Code, se rompe. El plan lo cubre con un test de fixtures de capturas reales (`e2e/fixtures/panes/`) y con degradar a "solo JSONL" sin romper si el parser no reconoce el pane.
- **Turnos reales = cuota.** La suite completa con turnos reales gasta. Se usan prompts mínimos y el CLI falso donde alcanza; igual, la suite se corre con el gobernador en verde y se informa el costo de cada corrida (`consumo.py`).
- **Sesiones de tmux viejas `prueba-*` en la barra** (`prueba-e2e`, `prueba-ask-tmux`…, del plan de limpieza). No son de este plan; no se tocan.

### Áreas relacionadas a monitorear
- **Cola de mensajes (`373dc739`) y mensajes programados**: el cambio en el dispatcher afecta a los mensajes programados de sesiones no tmux. Tienen que seguir saliendo.
- **`servidor-code` lee el mismo `cuota.json`** (`limites.mjs`): no se cambia el formato del archivo, solo cómo lo lee CloudCLI.
- **`orquestar.py` y `sesiones.py`** escriben `sesiones.json`. CloudCLI solo lo lee; el formato no cambia.
- **Plugins de CloudCLI** (`cloudcli-plugin-terminal`) y la terminal del navegador: no se tocan, pero el cambio del watcher a inotify comparte proceso.
- **Providers `codex`, `cursor` y `opencode`**: el cambio del protocolo (`messageId`, `blockIndex`) tiene que ser opcional para ellos. Si no lo mandan, el cliente cae al comportamiento actual de una fila por run.

### Zonas intocables
- Auto-confianza de tmux (`asegurarConfianzaProyecto`, plan del 16-sep, verificado en vivo).
- `KillMode=process` y la unidad `deploy/cloudcli.user.service`.
- La limpieza automática y `sidebar_archived` (`ed997afa`, `36795114`), salvo la excepción de `/tmp/cloudcli-e2e/`.
- `servidor-code` y `app-optimum-mkt`: se leen como referencia, no se editan.
- `orquestar.py`, `sesiones.py`, `hibernar.py`, `gobernador.py`: se usan, no se editan.

### Sugerencias opcionales
- [ ] **Cuota fresca sin REPL abierta**: un refresco cada 5 min contra el endpoint OAuth de uso, con el token local de Claude Code, que escribe `cuota.json` con `origen:"oauth"`. Toca una credencial: solo con tu OK. Esfuerzo: ~2 h.
- [ ] **Smoke E2E diario por timer** (`cloudcli-e2e.timer`): solo los escenarios con CLI falso, sin gastar cuota, y un pendiente en Norte si algo se rompe. Así no vuelve a pasar que un fix "verde" no ande. Esfuerzo: ~1 h.
- [ ] **Borrar `~/cloudcli/~/workspace-leandro/…`**: hay una carpeta literal `~` dentro del repo (gitignoreada por `*~`), creada por algún comando que no expandió la tilde. Habría que averiguar cuál la crea. Esfuerzo: 15 min.
- [ ] **Borrar `server/modules/websocket/tests/zz-probe.test.ts`**: está sin trackear y solo tiene `export {};`. Esfuerzo: nulo.

---

## Fases

### Fase 1 - Arnés E2E e instancia de prueba
**Goal (done-criterion):** Existen `e2e/instancia.mjs`, `e2e/sesiones.mjs`, `e2e/claude-falso.mjs`, `e2e/correr.mjs` y `e2e/humo.mjs` Y `node e2e/correr.mjs humo` abre `:3901` logueado, crea una sesión `e2e-humo` headless, recibe un turno real y uno falso en `:3902`, saca capturas y deja `tmux ls` sin `e2e-*` Y todos los checks de `#### Estado` en `[pass]`.
**Alcance:** Tocar: `e2e/`, `package.json` (devDependency y scripts), `.gitignore`, la exclusión de `/tmp/cloudcli-e2e/` en `server/modules/limpieza/`. Ignorar: `src/`, el resto de `server/`, `servidor-code`, `app-optimum-mkt`.
**Paralelizable:** No - todas las fases verifican con este arnés.

#### Pasos
1. `NODE_ENV=development npm i -D playwright-core@1.63.0` (la misma versión que ya anduvo en `/tmp/taller-ui/shot.mjs`). Lanzar con `executablePath` explícito al `chrome-headless-shell` de `~/.cache/ms-playwright/chromium_headless_shell-1243`.
2. `e2e/instancia.mjs up|down [--falso]`: levanta `node dist-server/server/index.js` con `SERVER_PORT=3901` (o `3902` con `--falso`), `HOST=127.0.0.1`, `DATABASE_PATH=/tmp/cloudcli-e2e/auth-<puerto>.db` y `RUTA_CUOTA_JSON=/tmp/cloudcli-e2e/cuota.json` (la usa la Fase 3). Registra el usuario `e2e` con contraseña aleatoria (`/api/auth/register`, la DB es nueva) y guarda el token en `/tmp/cloudcli-e2e/token-<puerto>` (600). Nunca lee `~/.cloudcli/auth.db`.
3. Cargar el token con `addInitScript` en `localStorage['auth-token']`, igual que `shot.mjs`.
4. `e2e/sesiones.mjs`: `crearHeadless(nombre)` por la UI; `crearTmux(nombre)` con `~/workspace-leandro/.claude/bin/orquestar.py crear <nombre> ejecutora /tmp/cloudcli-e2e/proyecto`; `teardown()` que lista `tmux ls`, filtra **solo** `^e2e-`, cierra con `orquestar.py cerrar` y archiva el proyecto de prueba. Si un nombre no empieza con `e2e-`, tira error y no toca nada.
5. Antes de crear sesiones, consultar `gobernador.py`: en rojo, la suite aborta.
6. `e2e/claude-falso.mjs`: script ejecutable que habla `stream-json` (lee el prompt por stdin y emite `system/init`, `stream_event`s, `assistant` y `result` según `E2E_GUION`). Partir de una grabación real: `e2e/fixtures/turnos/*.jsonl` con los mensajes crudos del SDK de un turno real de Haiku, grabados una vez. Guiones: `humo`, `pensamiento`, `subagente-a-mitad`, `stderr-a-mitad`, `6000-deltas`, `pregunta`. Antes de escribir el guion, confirmar en `claude-runtime.provider.js:243-245` y en el SDK 0.3.260 cómo se invoca `CLAUDE_CLI_PATH` (argumentos y protocolo).
7. `e2e/correr.mjs <escenario|grupo|todo>`: corre escenarios de `e2e/escenarios/<grupo>/<nombre>.mjs`. Cada escenario exporta `{ checks: [...] }` y cada check deja `pasa|falla`, la captura (`page.screenshot`) y el log (frames WS con `page.on('websocket')`) en `e2e/evidencia/<corrida>/`. Al final escribe `informe.md` con una tabla check → resultado → evidencia.
8. Helpers de medición reutilizables: `muestrearTexto(selector, cadaMs, n)` (largo del texto en el tiempo), `mismoNodo(selector)` (marca el nodo con un atributo y verifica que no se remonta), `contarApariciones(texto)`, `framesWS(tipo)`.
9. Exclusión en `server/modules/limpieza/`: los proyectos bajo `/tmp/cloudcli-e2e/` no cuentan para el tope de 3 y se archivan siempre. Test unitario.
10. `.gitignore`: `e2e/evidencia/**/*.zip` (trazas) y `e2e/evidencia/**/*.webm` (videos). Las PNG y los `informe.md` sí van a git. La DB y los tokens viven en `/tmp/cloudcli-e2e/`, fuera del repo.

#### Estado (arranca todo en fail)
> El agente ejecutor solo cierra la fase cuando cada check pasa de `[fail]` a `[pass]` mediante validación real.
- [pass] Chromium headless abre y captura | valida: `node e2e/humo.mjs`
- [pass] Instancia `:3901` con DB propia y login de prueba | valida: `node e2e/instancia.mjs up && curl -s -H "Authorization: Bearer $(cat /tmp/cloudcli-e2e/token-3901)" 127.0.0.1:3901/api/auth/user`
- [pass] `~/.cloudcli/auth.db` intacto (mismo `sha256sum` antes y después) | valida: `sha256sum ~/.cloudcli/auth.db`
- [pass] CLI falso reproduce el guion `humo` en `:3902` sin gastar cuota | valida: `node e2e/correr.mjs falso/humo`
- [pass] Teardown deja cero `e2e-*` y no toca otras sesiones (lista de `tmux ls` sin `e2e-` igual antes y después) | valida: `node e2e/sesiones.mjs prueba-teardown`
- [pass] Teardown con un nombre sin prefijo tira error | valida: test en `e2e/tests/teardown.test.mjs`
- [pass] Limpieza excluye `/tmp/cloudcli-e2e/` | valida: `NODE_ENV=test npm test -- limpieza`
- [pass] `informe.md` generado con tabla y capturas | valida: `cat e2e/evidencia/humo-*/informe.md`

#### Peligros
- Crear sesiones con el gobernador en rojo (REGLA 11). El paso 5 lo corta.
- Que el teardown, por un bug en el filtro, cierre una sesión de Leandro. Por eso el filtro se testea solo, antes de usarlo.
- Que la instancia `:3901`, al compartir `~/.claude`, dispare la limpieza o el `sessions-watcher` sobre la DB de prueba con proyectos reales: es esperado (ve lo mismo que Leandro) y no escribe nada fuera de su `auth.db`. Verificar que el servicio de limpieza de la instancia de prueba está **apagado** (env o flag) para no archivar dos veces.
- `NODE_ENV=production` heredado: `npm i` omite devDependencies si no se pisa.

#### Mejores prácticas
- Cada check guarda su evidencia aunque pase: un "pasa" sin captura no vale.
- Los tiempos se miden, no se esperan con `sleep`: `waitForFunction` con tope y el tiempo real en el informe.

---

### Fase 2 - Línea base: reproducir todo en rojo
**Goal (done-criterion):** Existe `e2e/evidencia/00-linea-base/informe.md` con una fila por cada síntoma de los 8 puntos y por cada commit del 5-oct (`1329d865`, `ed997afa`, `36795114`, `62d63c69`, `4158e887`, `8267cbe1`, `373dc739`), cada una con resultado y evidencia, Y cada síntoma que Leandro reportó está reproducido (falla) o documentado como "no reproduce" con la captura que lo muestra.
**Alcance:** Tocar: `e2e/escenarios/`, `e2e/evidencia/00-linea-base/`. Ignorar: todo `src/` y `server/` (esta fase no arregla nada).
**Paralelizable:** No - define los checks que cierran las fases siguientes.

#### Pasos
1. Construir el `dist/` de `HEAD` (`npm run build`) y levantar `:3901` y `:3902`.
2. Escribir los escenarios que usan las fases 3 a 9 (los nombres de las Micro-tasks) y correrlos todos sobre el código actual.
3. Por commit del 5-oct, un escenario que verifica lo que dice su mensaje:
   - `1329d865`: respuesta en streaming ni partida ni duplicada (headless real + guiones `subagente-a-mitad` y `stderr-a-mitad`).
   - `ed997afa` / `36795114`: tope de 3 + fijados; la barra se actualiza sola al archivar.
   - `62d63c69`: la sugerencia gris en el cuadro del pane cuenta como vacío (enviar con sugerencia visible).
   - `4158e887`: selección múltiple terminable desde la tarjeta tmux.
   - `8267cbe1`: diálogos del pane y "Enviado" verificado.
   - `373dc739`: cola de mensajes.
4. Medir y anotar los números de hoy: latencia de la primera fila en tmux, tiempo hasta `complete`, cantidad de remontajes de la fila en streaming, tiempo de aparición de una sesión del orquestador en la barra.
5. Informe: tabla + un párrafo por punto con la causa confirmada o descartada contra el diagnóstico del Contexto.

#### Estado (arranca todo en fail)
- [pass] Informe con los 8 puntos y los 7 commits | valida: `grep -c '^|' e2e/evidencia/00-linea-base/informe.md` ≥ 30
- [pass] Cada fila tiene captura o log enlazado y existente | valida: script que verifica los links del informe
- [pass] Números de línea base anotados (latencias, remontajes) | valida: lectura del informe
- [pass] Teardown limpio al final | valida: `tmux ls | grep -c '^e2e-'` = 0

#### Peligros
- Un síntoma que no se reproduce en headless de Playwright pero sí en el celular de Leandro (red móvil, pestaña en segundo plano). Si no reproduce, se repite con `page.emulate` de un iPhone, con red lenta (`route` con demora) y con la pestaña oculta (`visibilitychange`) antes de anotar "no reproduce".

---

### Fase 3 - Cuota del header siempre con dato real
**Goal (done-criterion):** `usage-window.service.ts` relee `cuota.json` (ruta por `RUTA_CUOTA_JSON`) y lo vigila con `fs.watch` Y los escenarios `cuota/en-vivo`, `cuota/vieja` y `cuota/sin-turnos` pasan Y todos los checks de `#### Estado` en `[pass]`.
**Alcance:** Tocar: `server/modules/usage-window/`, `src/modules/usage-window/`. Ignorar: el chat, tmux, `servidor-code` (solo se lee `limites.mjs` como referencia).
**Paralelizable:** Sí - no comparte archivos con las fases 4 a 9.

#### Pasos
1. `usage-window-cuota-file.service.ts`: la ruta sale de `process.env.RUTA_CUOTA_JSON ?? ~/.cache/aos/cuota.json`, igual que `servidor-code`.
2. `getUsageWindow`: leer el archivo en cada llamada y quedarse, por ventana, con la lectura de `leidoEn` más nuevo entre memoria y archivo. Borrar la condición de "solo si las dos son null" y la negativa a pisar estado de `seedDesdeArchivo`.
3. `fs.watch` del directorio (el archivo se reescribe con rename) con debounce de 300 ms → `scheduleUsageWindowBroadcast`. Respaldo: re-chequeo cada 60 s.
4. Cliente: nunca mostrar "sin dato" si existe una lectura. Si es vieja (> 15 min), se muestra el valor con "hace N min" en gris. Si ya pasó el `resets_at` de la ventana, se muestra "ventana nueva" y la hora del reset, no un porcentaje inventado. Refetch en `visibilitychange` y al reconectar el WS.
5. Mostrar siempre los dos valores: 5 h y semanal, con la hora de reset de cada una.
6. Tests: server (lectura más nueva, archivo inexistente, archivo corrupto, rename) y cliente (vieja, reseteada, en vivo).

#### Estado (arranca todo en fail)
- [pass] Tests de server verdes | valida: `NODE_ENV=test npm test -- usage-window`
- [pass] Tests de cliente verdes | valida: `NODE_ENV=test npx vitest run src/modules/usage-window`
- [pass] Escribir `cuota.json` con 5h=41 y 7d=22 cambia el header abierto en ≤ 3 s, sin recargar | valida: `node e2e/correr.mjs cuota/en-vivo`
- [pass] Sin ningún turno durante 20 min, el header sigue mostrando los dos porcentajes con su antigüedad | valida: `node e2e/correr.mjs cuota/sin-turnos` (con `ts` envejecido a mano, no esperando 20 min)
- [pass] Ventana reseteada muestra "ventana nueva" y la hora | valida: `node e2e/correr.mjs cuota/vieja`
- [pass] El texto "sin dato" no aparece en ningún escenario con archivo presente | valida: `grep -L "sin dato" e2e/evidencia/03-cuota/*.html`

#### Peligros
- `fs.watch` sobre un archivo que se reemplaza por rename deja de disparar: por eso se vigila el directorio.
- El formato de `cuota.json` lo comparten `servidor-code`, `gobernador.py` y `consumo.py`: no se escribe nada nuevo en él desde CloudCLI salvo lo que ya escribía.

---

### Fase 4 - Protocolo de streaming con identidad (server)
**Goal (done-criterion):** El normalizador emite `stream_delta {messageId, blockIndex, content}`, `thinking_delta {messageId, blockIndex, content}` y `activity {kind:'thinking'|'tool', name?, parentToolUseId?}`, y el `text` final lleva el mismo `messageId` + `blockIndex` Y `query()` pide `thinking` summarized Y el replay coalesce deltas Y todos los checks en `[pass]`.
**Alcance:** Tocar: `server/modules/providers/list/claude/`, `server/modules/websocket/services/chat-run-registry.service.ts`, `shared/` (tipos de `NormalizedMessage`). Ignorar: `src/`, tmux, los otros providers (solo tienen que seguir compilando).
**Paralelizable:** Sí - con las fases 3 y 8. Con la 7 comparte `shared/` (tipos): coordinar el contrato antes.

#### Pasos
1. Grabar los `stream_event` crudos de un turno real con texto, thinking, tool y subagente: `e2e/fixtures/turnos/completo.jsonl`. Es la base de los tests y del CLI falso.
2. Definir el contrato en `shared/` (tipos) y escribirlo en `docs/architecture/protocolo-streaming.md`: qué evento sale, con qué campos, en qué orden, y cómo se ve para providers que no mandan `messageId` (compatibilidad).
3. Normalizador (`claude-sessions.provider.ts:1094-1099`):
   - `message_start` → guarda `message.id` del run.
   - `content_block_start` → `activity` (`thinking` o `tool` con nombre) y registra el tipo del bloque `index`.
   - `content_block_delta` con `text_delta` → `stream_delta` con `messageId` + `blockIndex`; con `thinking_delta` → `thinking_delta`.
   - `content_block_stop` → `stream_end` con `messageId` + `blockIndex`.
4. El `text` completo (`:1417-1466`) lleva `messageId` (el `message.id` de la API, no el `uuid` de la fila) + `blockIndex`, para que el cliente reemplace en vez de agregar.
5. `claude-runtime.provider.js`: `thinking: {type:'adaptive', display:'summarized'}` cuando el modelo lo soporta (misma condición que `servidor-code/server.mjs:851-854`).
6. Subagentes: hoy se descartan sus partials (`:456-464`). Reenviar solo `activity` con `parentToolUseId` (qué tool está usando el subagente) y sus `text` completos. No streamear el texto del subagente (ruido y costo de replay).
7. `chat-run-registry.service.ts`: al guardar para replay, fusionar `stream_delta` consecutivos del mismo `(messageId, blockIndex)` en un solo evento. El tope de 5000 deja de alcanzarse con un turno largo.
8. Tests con los fixtures.

#### Estado (arranca todo en fail)
- [pass] Contrato escrito y tipado | valida: `docs/architecture/protocolo-streaming.md` existe y `npm run build:server` compila
- [pass] Normalizador emite los eventos nuevos con ids, a partir de los fixtures reales | valida: `NODE_ENV=test npm test -- claude-sessions`
- [pass] Turno real con Sonnet trae `thinking_delta` con texto en los frames WS | valida: `node e2e/correr.mjs headless/pensamiento` (frames en la evidencia)
- [pass] 6000 deltas + reconexión a mitad: sin `history_truncated` | valida: `node e2e/correr.mjs falso/6000-deltas`
- [pass] Providers codex/cursor/opencode compilan y sus tests siguen verdes | valida: `NODE_ENV=test npm test`

#### Peligros
- El `message.id` de la API no es el `uuid` de la fila JSONL. Se usa el `message.id` porque es lo que comparten el delta y el mensaje final; el historial recargado tiene que traerlo también (está en `message.id` de cada fila assistant del JSONL).
- `display:'summarized'` cambia el costo del turno: medir con `consumo.py` antes y después en el informe.

---

### Fase 5 - Una fila por bloque y tipeo real (cliente)
**Goal (done-criterion):** El store guarda una fila por `(messageId, blockIndex)` con key = id; el `text` final reemplaza esa fila; no existen `dropStreamFragmentsOf`, `isEchoOfFullText` ni `dedupeAdjacentAssistantEchoes` Y los escenarios `headless/tipeo`, `headless/actividad` y `falso/intercalados` pasan Y todos los checks en `[pass]`.
**Alcance:** Tocar: `src/modules/chat/hooks/useSessionStore.ts`, `useChatRealtimeHandlers.ts`, `useChatMessages.ts`, `utils/streamBuffers.ts`, `utils/messageKeys.ts`, `ChatMessagesPane.tsx`, `transcript/MessageComponent.tsx` (solo la parte de streaming), `composer/ActivityIndicator.tsx`. Ignorar: diseño (Fase 10/11), tmux, cuestionario.
**Paralelizable:** No - depende del contrato de la Fase 4 y comparte archivos con las fases 7 y 9.

#### Pasos
1. `ChatMessage` gana `id`. Las filas de streaming usan `stream:<messageId>:<blockIndex>`; el `text` final con el mismo par actualiza esa fila (mismo id, `content` final, `streaming:false`). Sin `messageId` (otros providers) se mantiene el camino de hoy.
2. `updateStreaming` deja de tocar `timestamp`: el timestamp es el del primer delta.
3. `messageKeys.ts`: si hay `id`, la key es el id; nada de timestamps ni prefijos de contenido.
4. `finalizeStreamBuffer` deja de cerrarse por cualquier evento intercalado: el bloque se cierra solo con su `stream_end`. Los eventos de subagente (`parentToolUseId`) van a su tarjeta y no tocan la fila del bloque principal.
5. Borrar `dropStreamFragmentsOf`, `isEchoOfFullText` y `dedupeAdjacentAssistantEchoes` y sus tests; reemplazarlos por tests de "un `text` final con id existente no agrega fila".
6. `thinking_delta` → plegable "Pensando…" abierto mientras dura, como `ChatClaude.tsx:1518-1530`.
7. Indicador de actividad portado de `revelado.ts` de Optimum: línea con la tool o "pensando"; aparece antes del primer token y reaparece tras 800 ms sin texto. Reemplaza las palabras rotando de `ActivityIndicator.tsx`.
8. `useRevelado`: arranca vacío en la fila nueva y nunca se reinicia (la fila ya no se remonta).
9. Tests de cliente para cada regla; E2E de los tres escenarios.

#### Estado (arranca todo en fail)
- [pass] Cero referencias a las tres funciones de dedupe | valida: `! grep -rn "dropStreamFragmentsOf\|isEchoOfFullText\|dedupeAdjacentAssistantEchoes" src`
- [pass] Vitest verde (726/726) | valida: `NODE_ENV=test npx vitest run`
- [pass] Turno real: el nodo de la respuesta es el mismo de principio a fin y el largo crece en ≥ 5 muestras | valida: `node e2e/correr.mjs headless/tipeo`
- [pass] Indicador visible antes del primer token y con el nombre de la tool durante una tool (8/8; "Thinking…" reaparece a los 852 ms sin texto) | valida: `node e2e/correr.mjs headless/actividad`
- [pass] Guiones `subagente-a-mitad` y `stderr-a-mitad`: una fila por bloque, texto igual al final, cero duplicados | valida: `node e2e/correr.mjs falso/intercalados`
- [pass] Recargar a mitad del turno y al final da el mismo DOM de mensajes que sin recargar | valida: `node e2e/correr.mjs headless/recarga`

#### Peligros
- El historial recargado tiene que traer `messageId` + `blockIndex` en las filas, o al recargar se vuelve a una fila por mensaje y un turno en curso duplica. El check de recarga lo cubre.
- Borrar la dedupe por texto puede reabrir el eco del mensaje del usuario (`sessionMessageReconciliation.ts`), que es otro mecanismo: no se toca acá.

---

### Fase 6 - Subagentes en vivo
**Goal (done-criterion):** La tarjeta de la tool Agent/Task muestra, mientras el subagente corre, su descripción, la tool que está usando y su último texto, y se cierra con el resultado Y el escenario `headless/subagente` pasa con capturas a mitad y al final Y todos los checks en `[pass]`.
**Alcance:** Tocar: `useChatMessages.ts` (plegado por `parentToolUseId`), el renderer de la tool Agent/Task en `src/modules/chat/transcript/`. Ignorar: el protocolo (ya lo da la Fase 4), tmux.
**Paralelizable:** No - va después de la Fase 5 (mismos archivos de estado).

#### Pasos
1. La tarjeta escucha los `activity` con su `parentToolUseId` y muestra la tool en curso con el estilo de línea de actividad.
2. Los `text` del subagente se pliegan dentro de la tarjeta (ya pasa) y el último queda visible.
3. Varios subagentes en paralelo: una tarjeta por cada uno, cada una con su estado.
4. Tareas en background (`task_notification`): el resultado llega sin esperar a `requestLatestMessages`.
5. E2E con un turno real que delega 2 subagentes en paralelo con una tarea trivial.

#### Estado (arranca todo en fail)
- [pass] Captura a mitad del subagente con su tool en curso visible (rojo sin el arreglo, verde con él) | valida: `node e2e/correr.mjs headless/subagente`
- [pass] Dos subagentes en paralelo, dos tarjetas con estado propio (Bash en A, Read en B, sin cruzarse) | valida: mismo escenario, captura `paralelo.png`
- [pass] La respuesta principal no se parte ni se duplica con subagentes | valida: mismo escenario, `contarApariciones` = 1
- [pass] Vitest verde (733/733) | valida: `NODE_ENV=test npx vitest run`

---

### Fase 7 - Sesiones de tmux en vivo y sin doble envío
**Goal (done-criterion):** El fin de turno de tmux se calcula por id de fila, el JSONL se lee con inotify y corte por id, existe el lector del pane (`tmux-pane-vivo.service.ts`) que emite `activity` y borrador, y ninguna ruta resume por SDK una sesión con pane vivo Y los escenarios `tmux/turno-corto`, `tmux/latencia`, `tmux/en-vivo`, `tmux/rafaga` y `tmux/recarga` pasan Y todos los checks en `[pass]`.
**Alcance:** Tocar: `server/modules/websocket/services/tmux-bridge.service.ts`, `tmux-prompt.service.ts` (solo lo que comparte el lector), `chat-websocket.service.ts` (`handleChatSend`, `runDetachedChatTurn`, ack de subscribe), `server/modules/scheduled-messages/`, `server/modules/providers/services/sessions-watcher.service.ts`, `src/modules/chat/hooks/useChatRealtimeHandlers.ts` y `useChatComposerState.ts` (solo tmux). Ignorar: el streaming headless, diseño, `orquestar.py`.
**Paralelizable:** El server sí, con las fases 3, 4 y 8. El cliente va después de la Fase 6 (mismos archivos).

#### Pasos
1. **Fin de turno** (`tmux-bridge.service.ts:799-812`): guardar el `uuid` de la última fila user anunciada como completa. Hay `complete` cuando la última fila es fin de turno **y** su fila user es distinta de la anunciada. Test: user + `end_turn` en el mismo poll.
2. **Corte por id**: emitir las filas cuyo id no se emitió todavía, no `slice(ultimaCantidadEmitida)`. Si el historial se reescribe (compactación), no se pierden ni se repiten filas.
3. **Inotify**: `fs.watch` del archivo JSONL de cada sesión tmux vigilada, con debounce de 150 ms. El polling de chokidar queda de respaldo a 6 s.
4. **Lector del pane** (`tmux-pane-vivo.service.ts`, nuevo): para cada sesión tmux con un cliente suscrito, `capture-pane -p` cada 400 ms (solo mientras hay suscriptores).
   - Spinner de Claude Code (`✻ … (esc to interrupt)` y variantes) → `activity {kind:'thinking'|'tool', name, texto}`. Sin spinner y con el cuadro vacío → `activity {kind:'idle'}`.
   - Texto del turno en curso (el bloque `●` de la respuesta) → `stream_delta {messageId:'tmux-borrador:<sesión>', blockIndex:0}` con el texto acumulado (no diff; el cliente reemplaza).
   - Al llegar la fila assistant nueva por JSONL, el server emite `stream_reemplazo` que borra el borrador y deja la fila definitiva.
   - Fixtures de capturas reales en `e2e/fixtures/panes/` (pensando, tool, escribiendo, diálogo, libre, sugerencia gris) con un test por cada una. Si el parser no reconoce el pane, no emite nada (degrada a solo JSONL).
5. **Doble envío**:
   - `runDetachedChatTurn` y el dispatcher: si la sesión tiene pane propio o externo vivo, el mensaje se entrega por `teclearEnPane`, nunca con `--resume` por SDK.
   - `handleChatSend` rechaza (`TMUX_PANE_VIVO`) un turno SDK sobre una sesión con pane vivo, sea propio o externo.
   - Cliente: un error `TMUX_*` ya no hace `setRunsInTmux(false)`; muestra el error y deja el mensaje en el composer marcado "no salió".
   - `enviarPromptVerificado`: el segundo Enter solo si el texto sigue en el cuadro **y** no hay spinner. Antes de devolver `no-salio`, mirar el JSONL: si la fila user (o el `queued_command`) ya está, es "Enviado".
6. **`queued_command`**: los `attachment{type:"queued_command"}` del JSONL se reconcilian con el eco optimista como un mensaje del usuario, con estado "Enviado".
7. **Ack de subscribe** (`chat-websocket.service.ts:909,933-941`): para tmux, `isProcessing` sale del último `activity` del pane, no `false` fijo.
8. Cliente: la sesión tmux muestra el indicador y el borrador con los mismos componentes que headless (Fase 5).
9. E2E con sesiones reales `e2e-tmux-*`.

#### Estado (arranca todo en fail)
- [pass] Test de fin de turno con user + `end_turn` en el mismo poll | valida: `NODE_ENV=test npm test -- tmux-bridge`
- [pass] Tests del parser del pane con los 6 fixtures | valida: `NODE_ENV=test npm test -- tmux-pane-vivo`
- [pass] "Respondé solo OK" pasa a libre en ≤ 3 s, 10 de 10 | valida: `node e2e/correr.mjs tmux/turno-corto`
- [pass] Primera fila del JSONL en el navegador en ≤ 1,5 s | valida: `node e2e/correr.mjs tmux/latencia`
- [pass] "Pensando" ≤ 2 s después de "Enviado"; texto creciendo en ≥ 3 muestras; al final, una sola fila de respuesta | valida: `node e2e/correr.mjs tmux/en-vivo`
- [fail: server y cliente hechos y con tests en rojo-verde; falta correr el E2E, bloqueado por el gobernador en rojo] 5 mensajes seguidos (2 durante el turno): cada uno 1 vez en el pane, en el JSONL y en el DOM; un solo proceso `claude` en la sesión (`pgrep -f` por `session_id`) | valida: `node e2e/correr.mjs tmux/rafaga`
- [pass] Recargar a mitad del turno mantiene el indicador | valida: `node e2e/correr.mjs tmux/recarga`
- [pass] Mensajes programados de sesiones no tmux siguen saliendo | valida: `NODE_ENV=test npm test -- scheduled-messages`
- [pass] Tests de server verdes | valida: `NODE_ENV=test npm test`

#### Peligros
- `capture-pane` cada 400 ms por sesión: con 10 sesiones abiertas son 25 procesos por segundo. Solo con suscriptores, y medir la CPU en el informe (`pidstat` 60 s).
- El formato de la TUI cambia con las versiones de Claude Code: los fixtures fijan la versión (`claude --version` en el nombre de la carpeta).
- Tocar `teclearEnPane` puede romper la auto-confianza o los diálogos (`8267cbe1`): el escenario de línea base de `8267cbe1` se corre de nuevo al cerrar la fase.

---

### Fase 8 - Barra y componentes en vivo
**Goal (done-criterion):** Existe `docs/actualizacion-en-vivo.md` con el inventario de componentes y su fuente de actualización, `sessions-watcher` vigila `~/.cache/aos` con `fs.watch`, Y `barra/orquestador` y `barra/componentes` pasan Y todos los checks en `[pass]`.
**Alcance:** Tocar: `server/modules/providers/services/sessions-watcher.service.ts` (solo la parte de `~/.cache/aos`), `tmux-registry-sessions.service.ts`, `src/modules/sidebar/`, `src/modules/project-workspace/` y lo que el inventario marque sin actualización en vivo. Ignorar: chat, tmux bridge, diseño.
**Paralelizable:** Sí - con las fases 3, 4 y el server de la 7 (otro bloque de `sessions-watcher`: coordinar el merge).

#### Pasos
1. Inventario: por cada componente que muestra estado del servidor (barra, lista de sesiones, estado de cada sesión, títulos, header de cuota, panel git, árbol de archivos, tareas, notificaciones), anotar de dónde se actualiza: evento WS, polling o nada. Medir con la línea base cuáles fallan.
2. `fs.watch` del directorio `~/.cache/aos` (el registro se reescribe con rename), debounce de 200 ms. El polling de 3 s queda de respaldo.
3. Una sesión nueva sin transcript todavía aparece con estado "arrancando". Cuando aparece el `session_id`, se completa sin duplicarse.
4. Cerrar o dormir una sesión del orquestador cambia su estado en la barra en vivo.
5. Para cada componente "nada" del inventario: evento WS existente o nuevo, o justificación de por qué no hace falta.
6. Al reconectar el WS, refresco completo (ya existe, `useProjectsState.ts:750`): verificarlo con la pestaña oculta 5 min.

#### Estado (arranca todo en fail)
- [pass] Inventario sin filas "nada" sin justificar | valida: lectura de `docs/actualizacion-en-vivo.md`
- [pass] `orquestar.py crear e2e-orq …` aparece en la barra abierta en ≤ 3 s, 5 de 5 | valida: `node e2e/correr.mjs barra/orquestador`
- [pass] `orquestar.py dormir e2e-orq` cambia el estado en vivo | valida: mismo escenario
- [pass] Cada componente del inventario se actualiza sin recargar | valida: `node e2e/correr.mjs barra/componentes`
- [pass] Pestaña oculta 5 min y vuelta: la barra está al día | valida: `node e2e/correr.mjs barra/pestana-oculta`

---

### Fase 9 - Cuestionario que contesta bien y una sola vez
**Goal (done-criterion):** AskUserQuestion llega a la UI en los modos `default`, `auto` y `bypassPermissions`; en tmux la selección se compone en el cliente y se teclea de una vez; la pregunta se representa una sola vez (pendiente o respondida); el historial lee las respuestas de `toolUseResult` Y todos los escenarios `pregunta/*` pasan Y todos los checks en `[pass]`.
**Alcance:** Tocar: `claude-runtime.provider.js` (`canUseTool` / hook PreToolUse), `tmux-prompt.service.ts`, `server/shared/message-unification.ts`, `src/modules/chat/composer/` (lógica, no diseño), `toolConfigs.ts`, `QuestionAnswerContent.tsx`. Ignorar: el diseño del componente (Fase 11).
**Paralelizable:** No - después de las fases 5 y 7 (comparte el estado del cliente).

#### Pasos
1. Confirmar con un E2E si en `auto` y `bypassPermissions` la pregunta se contesta sola (línea base). Si sí: hook `PreToolUse` con matcher `AskUserQuestion` en `query()` que espera la respuesta de la UI y devuelve `updatedInput.answers`, en cualquier modo.
2. Tmux: la tarjeta guarda la selección en el cliente (casillas, "Otra" con texto) y al confirmar manda **una** orden con la selección completa. El server teclea la secuencia y verifica el resultado en el pane. La huella deja de incluir lo tildado.
3. Si igual da `TMUX_PROMPT_STALE`, la tarjeta lo dice ("la pregunta cambió, revisá") en vez de no hacer nada.
4. Representación única: con la pregunta pendiente, la tarjeta `tool_use` del transcript queda oculta (o en una línea "Pregunta abierta ↓"); al responder, un resumen Pregunta → Respuesta. En tmux se reemite el `tool_use` con las respuestas (por id, gracias a la Fase 7).
5. `message-unification.ts`: leer las respuestas del `toolUseResult` estructurado; la regex queda solo como respaldo para transcripts viejos.
6. Prompt de prueba que obliga a Claude a repetir lo elegido, para verificar que la respuesta llegó: "Usá AskUserQuestion con una pregunta de opción única (A/B/C), una múltiple (X/Y/Z) y una con comillas en el texto; después respondé solo con lo elegido, literal".

#### Estado (arranca todo en fail)
- [fail] Headless, modos `default`/`auto`/`bypassPermissions`: la pregunta aparece y Claude repite exactamente lo elegido | valida: `node e2e/correr.mjs pregunta/modos`
- [fail] Tmux, opción única: llega la elegida | valida: `node e2e/correr.mjs pregunta/tmux-simple`
- [fail] Tmux, múltiple con clics a 100 ms: llegan las 3 | valida: `node e2e/correr.mjs pregunta/tmux-multi`
- [fail] "Otra" con texto libre llega literal (headless y tmux) | valida: `node e2e/correr.mjs pregunta/otra`
- [fail] Cero textos de pregunta repetidos en el DOM antes y después de contestar | valida: `node e2e/correr.mjs pregunta/sin-repetidos`
- [fail] Pregunta con comillas bien tras recargar | valida: `NODE_ENV=test npm test -- message-unification` + `pregunta/recarga`
- [fail] Línea base de `4158e887` sigue verde | valida: `node e2e/correr.mjs linea-base/4158e887`

---

### Fase 10 - Design system y bocetos (Optimum + Apple)
**Goal (done-criterion):** Existen `design-system/README.md`, `branding.md`, `typography.md`, `tokens.md` y los bocetos `design-system/visual-refs/05-octubre-chat.html`, `05-octubre-cuestionario.html` y `05-octubre-header-barra.html`, Y Leandro aprobó los tres por AskUserQuestion, Y el ejemplo de cuestionario de Leandro está guardado en `design-system/visual-refs/05-octubre-cuestionario-ejemplo.md`.
**Alcance:** Tocar: `design-system/`. Leer como referencia: `app-optimum-mkt/src/components/features/claude/`, `MensajeMarkdown.tsx`, `tailwind.config.ts` de Optimum. Ignorar: `src/` (no se implementa nada acá).
**Paralelizable:** Sí - con las fases 3 a 9 (no toca código).

#### Pasos
1. **Bloqueante del cuestionario**: pedirle a Leandro el prompt de ejemplo por AskUserQuestion antes de dibujar `05-octubre-cuestionario.html`. Los otros dos bocetos no esperan.
2. Invocar `apple-design` y `aos-dev:ui-ux-pro-max` (REGLA 13), y correr `search.py "AI agent chat developer tool mobile-first" --design-system -p "CloudCLI"` más las búsquedas `--domain ux "streaming loading animation"`, `--domain ux "form radio checkbox mobile"` y `--stack react`.
3. Capturar el chat de Optimum como referencia visual. Si levantarlo pide credenciales de Supabase, no se levanta: se le piden capturas a Leandro y se trabaja desde el código.
4. Design system: base de Optimum (una sola sans `system-ui`, un acento, grises; Claude sin burbuja; usuario con tinte; columna `max-w-3xl`) más Apple (materiales translúcidos en header y composer, springs con `damping 1.0`, tracking por tamaño, `prefers-reduced-motion`, `prefers-reduced-transparency`). Fuera Merriweather y la mezcla de familias. Tokens concretos: hex claro y oscuro, escala tipográfica, spacing, radios, sombras, z-index.
5. Boceto del chat con el **recorrido entero**: barra → abrir sesión → escribir → enviar ("Enviado") → pensando (plegable) → tool en una línea → subagente con actividad → respuesta escribiéndose → fin. Desktop 1280 y 390, claro y oscuro.
6. Boceto del cuestionario: de qué mensaje sale, opción única, múltiple, "Otra" con texto, paso a paso con varias preguntas, revisión antes de enviar, enviado, resumen en el transcript; versión headless y tmux (misma cara). REGLA 13: texto mínimo con ⓘ por sección, íconos (Lucide), modal ancho en desktop (≈ 90 vw, tope 1200 px), pantalla completa a 390 px, pocos colores, objetivos de 44 px, navegación por teclado (números para elegir, Enter para seguir).
7. Boceto del header y la barra: cuota 5 h y semanal (barra + %, reset, antigüedad), estados de sesión (pensando, esperando respuesta, libre, dormida), sesión nueva entrando con animación.
8. Pasar cada boceto por la checklist de `ui-ux-pro-max` (contraste, foco, 375/768/1024/1440, sin scroll horizontal) y anotar el resultado en el propio HTML (comentario al final).
9. Aprobación de Leandro por AskUserQuestion, uno por boceto, con el link. Iterar en lotes.

#### Estado (arranca todo en fail)
- [pass] Ejemplo de cuestionario guardado (propuesto por el orquestador, decisión de Leandro) | valida: `test -s design-system/visual-refs/05-octubre-cuestionario-ejemplo.md`
- [pass] Cuatro archivos del design system con valores concretos | valida: `grep -c '#[0-9A-Fa-f]\{6\}' design-system/branding.md` ≥ 10
- [pass] Tres bocetos a 390 px sin scroll horizontal, en los dos temas | valida: `node e2e/correr.mjs visual/bocetos` (Playwright sobre los HTML)
- [pass] Boceto del chat aprobado por Leandro | valida: respuesta de AskUserQuestion
- [pass] Boceto del cuestionario aprobado por Leandro | valida: respuesta de AskUserQuestion (06-oct, por chat: "me parece bien el boceto")
- [pass] Boceto de header y barra aprobado por Leandro | valida: respuesta de AskUserQuestion

#### Peligros
- Diseñar el cuestionario sin el ejemplo de Leandro: el paso 1 lo bloquea.
- Copiar a Optimum píxel a píxel: es la base, no el techo. Apple suma movimiento y materiales.

---

### Fase 11 - Implementar el diseño
**Goal (done-criterion):** El chat, el componente `Cuestionario` (uno, con adaptadores headless y tmux), el header y la barra están implementados según los bocetos aprobados Y las capturas de `visual/*` (390/1280 × claro/oscuro) coinciden con los bocetos Y los escenarios funcionales de las fases 3 a 9 siguen verdes Y axe sin violaciones serias Y todos los checks en `[pass]`.
**Alcance:** Tocar: `src/modules/chat/` (render), `src/modules/usage-window/`, `src/modules/sidebar/`, `tailwind.config.js`, `src/index.css`, `src/shared/ui/`. Ignorar: server, protocolo, lógica del store (ya cerrada).
**Paralelizable:** Parcial - chat, cuestionario y header+barra pueden ir en tres worktrees si no comparten tokens: los tokens van primero, en un commit propio.

#### Pasos
1. Tokens del design system en `tailwind.config.js` e `index.css` (claro y oscuro). Fuera Merriweather y `font-serif` de `MessageComponent.tsx:148-151,431`.
2. Chat: respuesta sin burbuja ni avatar, usuario con tinte, columna de lectura, markdown estilo `MensajeMarkdown` (`remark-gfm`, tablas compactas, blockquote con el acento). Tools en una línea de actividad con detalle plegable; nada de tarjetas grandes por cada tool.
3. `Cuestionario`: un componente que reemplaza a `AskUserQuestionPanel.tsx`, `PermissionRequestsBanner.tsx` (la parte de preguntas) y `TmuxPromptBanner.tsx`. Dos adaptadores: `respuestaHeadless(answers)` y `respuestaTmux(seleccion)`. Teclado: números eligen, Enter sigue, Esc cierra sin responder.
4. Header: cuota 5 h y semanal según el boceto. Barra: estados y entrada animada de sesiones nuevas (spring `damping 1.0`, `response 0.35`; cross-fade con `prefers-reduced-motion`).
5. Bundle: correr `scripts/bundle-budget.mjs`. El componente nuevo no puede pasar el presupuesto (`docs/bundle-baseline.md`).
6. Capturas comparadas con los bocetos y auditoría axe.

#### Estado (arranca todo en fail)
- [pass] Cero `font-serif` / Merriweather en `src/` | valida: `! grep -rn "font-serif\|Merriweather" src`
- [fail] Capturas `visual/chat`, `visual/cuestionario`, `visual/header-barra` en 4 variantes cada una, revisadas contra el boceto | valida: `node e2e/correr.mjs visual`
- [fail] Escenarios funcionales de las fases 3 a 9 verdes con el diseño nuevo | valida: `node e2e/correr.mjs cuota headless tmux barra pregunta`
- [fail] axe sin violaciones `serious`/`critical` en chat y cuestionario | valida: `node e2e/correr.mjs a11y`
- [fail] Presupuesto de bundle respetado | valida: `npm run build:client`
- [fail] Vitest verde | valida: `NODE_ENV=test npx vitest run`

---

### Fase 12 - Verificación final en `:3901` y `:3001`
**Goal (done-criterion):** Existen `e2e/evidencia/final-3901/informe.md` y `e2e/evidencia/final-3001/informe.md` con **todos** los checks en pasa, Leandro confirmó en el celular, y todo está commiteado y pusheado en `diseno/propio`.
**Alcance:** Tocar: `e2e/evidencia/`, este plan. Ignorar: código (si algo falla, se vuelve a la fase que corresponde).
**Paralelizable:** No - es el cierre.

#### Pasos
1. `npm run build` y suite completa en `:3901` y `:3902`.
2. Tests unitarios de cliente y server.
3. Pedirle a Leandro el reinicio de `:3001` desde `ct` o ttyd (`npm run build && systemctl --user restart cloudcli`) y el hard refresh del navegador.
4. Pasada final contra `:3001`: Leandro exporta su login en una variable de entorno solo para esa corrida (`! read -s CLOUDCLI_PASS; export CLOUDCLI_USER=… CLOUDCLI_PASS`), el arnés hace login, corre todo con sesiones `e2e-*` y **no guarda el token en disco**.
5. Checklist corto para el celular de Leandro (los 8 puntos, uno por renglón) y su confirmación por AskUserQuestion.
6. Commit, push, plan en `completado`, `Cambios realizados` y `Continuación de Sesión` al día.

#### Estado (arranca todo en fail)
- [fail] Suite completa verde en `:3901`/`:3902` | valida: `node e2e/correr.mjs todo`
- [fail] Unitarios verdes | valida: `NODE_ENV=test npx vitest run && NODE_ENV=test npm test`
- [fail] Suite completa verde en `:3001` | valida: `CLOUDCLI_URL=http://100.77.186.53:3001 node e2e/correr.mjs todo`
- [fail] Ningún token ni contraseña en disco después de la corrida en `:3001` | valida: `grep -rn "$CLOUDCLI_USER" /tmp/cloudcli-e2e e2e/ || true` vacío, y sin archivos de token del 3001
- [fail] Cero `e2e-*` vivas y el proyecto de prueba archivado | valida: `tmux ls | grep -c '^e2e-'` = 0
- [fail] Leandro confirma los 8 puntos en el celular | valida: AskUserQuestion
- [fail] Push hecho | valida: `git fetch && git status -sb` sin `ahead`

---

## Orden de ejecución

```
Fase 1 (arnés) → Fase 2 (línea base)
                    ├─ Fase 3 (cuota) ─────────────────────────────┐
                    ├─ Fase 4 (protocolo, server) → Fase 5 → Fase 6 ┤
                    ├─ Fase 7 server ─────────────── (cliente tras 6)┤→ Fase 9 → Fase 11 → Fase 12
                    ├─ Fase 8 (barra) ─────────────────────────────┤
                    └─ Fase 10 (diseño; el cuestionario espera el ejemplo) ┘
```

- **Secuenciales**: 1 → 2 al principio; 5 → 6 → cliente de 7 → 9 (comparten `useSessionStore.ts` y `useChatRealtimeHandlers.ts`); 11 después de 9 y 10; 12 al final.
- **En paralelo después de la Fase 2**: 3, 4, el server de 7, 8 y 10. La 7 y la 8 tocan bloques distintos de `sessions-watcher.service.ts`: el que mergea segundo resuelve el conflicto y vuelve a correr los escenarios del otro.

## Verificación final

`node e2e/correr.mjs todo` verde contra `:3901`/`:3902` y contra `:3001` después del reinicio de Leandro, con `e2e/evidencia/final-*/informe.md` (una fila por check, captura o log por fila), unitarios verdes, y la confirmación de Leandro en el celular de los 8 puntos.

## Riesgos globales

- **Cuota**: la suite con turnos reales gasta. Corre solo con el gobernador en verde; el costo de cada corrida va al informe. Si la cuota corta a mitad, el arnés deja todo cerrado igual (teardown en `finally`).
- **La TUI de Claude Code cambia**: el lector del pane y la detección de diálogos son frágiles por naturaleza. Los fixtures con la versión fijada avisan cuando cambie.
- **Sesiones de prueba visibles para Leandro** mientras corre la suite (mismo `~/.claude`). Se avisa antes de cada corrida larga.
- **Reinicio de `:3001`**: mata las sesiones del navegador (las de tmux sobreviven). Lo hace Leandro, cuando él decida.
- **Dos copias del repo**: `git pull` antes de cada fase y push al cerrarla. La notebook no debería tocar `diseno/propio` mientras corre este plan.

---

## Cambios realizados

**Fase 1 (05-oct):**
- `playwright-core` vive en `e2e/package.json` propio (no como devDependency de la raíz): así no toca el `node_modules` que usa el servicio de `:3001`. Se instala con `cd e2e && NODE_ENV=development npm install`.
- El proyecto de prueba va en `~/.cache/cloudcli-e2e/proyecto`, no en `/tmp/cloudcli-e2e/proyecto`: `validateWorkspacePath` rechaza `/tmp` y exige estar bajo el home. La exclusión de la limpieza (`esProyectoDePrueba`) reconoce esa ruta.
- Dos rutas del server se volvieron configurables para que una instancia de prueba no pise las de `:3001`: `LOCAL_SERVER_MARKER_PATH` (`server/index.ts`) y `RUTA_CUOTA_JSON` (`usage-window-cuota-file.service.ts`). Esta última **ya se leía en el plan pero el server la ignoraba**: hasta hoy las instancias de prueba leían el `cuota.json` real.
- Las sesiones nuevas de la UI nacen en tmux (`setRunsInTmux(true)`), así que "crear headless por la UI" gasta cuota real. Las pruebas headless crean la sesión con el CLI falso (`-p`) y la abren por URL: el ack dice `runsInTmux=false` y los turnos van por `chat.send`.
- 🔴 **Efecto colateral detectado y contenido:** `:3001` comparte `~/.claude`, así que veía el proyecto de prueba como actividad interactiva y le dio un lugar del tope a las 17:36 UTC, desplazando a `app-optimum-main` (su sesión `optimumstock-guia-1` se salvó de dormirse solo por tener cambios sin commitear). Contención: el CLI falso escribe `entrypoint: 'sdk-cli'` (no cuenta como actividad), se reescribieron los 26 transcripts de prueba y se movió el único interactivo (`72b0937a`, de una sesión real de tmux creada por error al probar la UI) a `~/.cache/cloudcli-e2e/transcripts-retirados/`. El arreglo de fondo (`esProyectoDePrueba` fuera del tope, con test) **solo corre en `:3001` después de rebuild + reinicio**, que decide Leandro.
- La barra filtra por defecto "solo tmux vivo": los escenarios de la barra lo apagan en su navegador (`mostrarTodasLasSesiones`). El CLI falso escribe un `ai-title` con el nonce para que cada sesión de prueba se distinga por texto.
- Los 404 de abrir una sesión todavía sin indexar se guardan aparte (`[carga]` en `consola-*.txt`): miden la carrera del punto 4, no la salud del turno.
- Suite de server: 2 fallas **previas a este plan** en `shell-tmux.test.ts` (también fallan en un worktree limpio de `HEAD`), y 4 más que solo aparecen si el shell exporta `CLAUDE_CLI_PATH`/`TMUX` (el de un agente lo hace).

**Fase 2 (05-oct):**
- Validado: `grep -c '^|'` = 103; `node e2e/verificar-informe.mjs e2e/evidencia/00-linea-base/informe.md` → 70 filas, 0 problemas; `tmux ls | grep -c '^e2e-'` = 0. Los números y la lectura por punto y por commit están en `e2e/evidencia/00-linea-base/lectura.md`, que `correr.mjs` agrega al final de `informe.md` (después de `---`).
- Estado nuevo en el informe: **bloqueado** (`ctx.bloquear(motivo)`). Lo usa `headless/pensamiento`: `:3901` no tiene `CLAUDE_CODE_OAUTH_TOKEN` y la suite no maneja credenciales (decide Leandro). El verificador saltea esas filas.
- Los checks sin evidencia propia guardan los frames del WS (`frames-0.json`) como respaldo, así ninguna fila queda sin enlace.
- Resultado: 8267cbe1 y 62d63c69 pasan; 4158e887 falla; 373dc739 pasa headless y falla en tmux; 1329d865 parcial; ed997afa/36795114 seleccionan bien pero la barra abierta no se entera.

**Grupo A — Fases 3, 4, 8 y 10 (05/06-oct), en cuatro worktrees en paralelo:**
- Para correr en paralelo, el arnés tomó `E2E_RAIZ`, `E2E_PUERTO_BASE`, `E2E_PROYECTO_DIR` y `E2E_PREFIJO` (`06c0fc09`): cada worktree con su instancia, sus puertos y su prefijo de tmux.
- Revalidado por el orquestador sobre `diseno/propio` con las cuatro ramas mergeadas (corrida `e2e/evidencia/revalida-grupo-a/`, 75 filas, 0 problemas en `verificar-informe.mjs`). Server 831/834 (las 2 fallas viejas de `shell-tmux.test.ts` + 1 skip); cliente 717/717.
- Fase 3: `cuota.json` se relee y se vigila (`fs.watch` del directorio, debounce 300 ms, respaldo 60 s); por ventana gana la lectura más nueva. El header cambia en 1,4 s sin recargar; lectura vieja = "% hace N min"; ventana vencida = "ventana nueva (se renovó a las …)". El check de "sin dato" se corre sobre `label*.txt` (el arnés no guarda HTML).
- Fase 4: contrato en `docs/architecture/protocolo-streaming.md`; `headless/actividad` pasa de 0 a 11 deltas de pensamiento. El fixture `e2e/fixtures/turnos/completo.jsonl` es **sintético** (sin token para grabar uno real); `modelSupportsAdaptiveThinking` es una aproximación estática (excluye Haiku). Lo que sigue en rojo del lado del cliente (remontaje, razonamiento visible, pregunta duplicada) es de las Fases 5 y 9.
- Fase 8: además del `fs.watch` de `~/.cache/aos`, tres arreglos fuera de lo previsto: archivar/restaurar y renombrar no emitían nada a la barra, y `mergeExpandedSessionPages` volvía a pegar una sesión archivada en el refresco de reconexión. Orquestador: 5 de 5 en ≤ 3 s (1,6 s; la línea base daba 4,45 s). El escenario tenía un error propio que corregí al revalidar: medía la siguiente creación antes de que saliera la fila de la anterior dormida, y las dos se compensaban en el conteo.
- Fase 10: design system y dos bocetos (chat, header y barra); el del cuestionario espera el ejemplo de Leandro. 16/16 sin scroll horizontal ni errores de consola.

**Fase 7 server (06-oct), worktree aparte:**
- Revalidado sobre `diseno/propio` mergeado (corrida `e2e/evidencia/revalida-fase-7/`): `turno-corto` 10 de 10, `latencia` 0,72 s (era 4,3 s), `en-vivo` "pensando" a 0,75 s, `recarga` con `isProcessing:true`, `commits` (8267cbe1 y 62d63c69) siguen verdes. Server 844/847 (las 2 viejas + 1 skip).
- `tmux/rafaga` sigue en rojo, **pero no es el server**: con un socket crudo, 3 mensajes (2 durante el turno) llegan una vez cada uno. El composer no manda nada mientras el turno está ocupado: es el paso 5-cliente/8, después de la Fase 6. Contrato para el cliente: `activity` (`activityKind`, `idle`), `stream_delta` con `messageId:'tmux-borrador:<sid>'` (contenido acumulado, se reemplaza), `stream_reemplazo` (borrar el borrador), `protocol_error TMUX_PANE_VIVO`.
- No se hizo la mejora de `enviarPromptVerificado` (segundo Enter según el spinner): medido, el envío ya no se pierde ni se duplica sin ella.
- `npm test -- <filtro>` no filtra en este repo: corre la suite entera.
- Fase 10: Leandro aprobó los bocetos del chat y del header y la barra. **No pasa ejemplo de cuestionario**: el boceto lo propone el orquestador y él lo aprueba o no.

**Fase 10, cuestionario (06-oct):** Leandro aprobó el boceto (`05-octubre-cuestionario.html`, merge `153407af`). El ejemplo `.md` se alineó al boceto en las dos cosas en que diferían: destino "Otra → `~/.cache/aos/export-sesiones.csv`" y resumen como una oración de Claude, no una línea compacta. `visual/bocetos` revalidado por el orquestador: 24/24 (tres bocetos × 390/1280 × claro/oscuro, sin scroll horizontal ni errores de consola; `e2e/evidencia/revalida-fase-10-cuestionario/`). Fuera del plan, para poder revisarlo: el panel Salidas ganó anchos ajustables y "Pestaña nueva" (`68b49293`, `visual/salidas` 5/5).

**Fase 5 (06-oct), worktree `wf_da5db4bc-5d1-1`, merge `b2336399`:** filas de streaming con id `stream:<messageId>:<blockIndex>`; el `text` final reemplaza esa fila; las tres funciones de dedupe borradas y reemplazadas por `streamIdentity.test.tsx`. Dos arreglos fuera del texto del plan: (1) la fila que vuelve por REST después de `complete` traía su uuid de transcript y remontaba el nodo; ahora `withStreamRowIdentity` se aplica también en `requestSessionHistoryPage`; (2) el CLI falso mandaba un evento `assistant` por bloque, y dos bloques del mismo mensaje caían en el mismo `blockIndex`: ahora manda uno con todo el `content`, como el SDK real. Revalidado por el orquestador (`e2e/evidencia/revalida-fase-5/`, 21/21, incluye `falso/humo` y `falso/6000-deltas` por el cambio al CLI falso). **No se hicieron** los pasos 3 (`messageKeys.ts`), 7 (indicador portado de `revelado.ts`) y 8 (`useRevelado`): los escenarios pasan sin ellos, pero el indicador sigue siendo "Thinking…".

**Fase 5, paso 7 (06-oct), merge `80a50075`:** la línea de actividad dice "Thinking" o el nombre de la tool, sin palabras rotando; mientras llega la respuesta `statusText: ''` calla la etiqueta (quedan el tiempo y el Stop) y a los 800 ms sin texto vuelve "Thinking…". Guion `herramienta` en el CLI falso y 3 checks nuevos en `headless/actividad`. El primer verde del agente era falso: el check de reaparición veía "Thinking…" porque era la palabra rotada de turno, y al sacar la rotación dio 24 ms; se corrigió el componente, no el check (`e2e/evidencia/revalida-fase-5-paso7/`). Los pasos 3 y 8 ya estaban hechos (`messageKeys.ts` usa `message.id` primero; `arrancarVacio` en la fila viva).

**Fase 6 (06-oct), worktree `wf_da5db4bc-5d1-1`:** las `activity` con `parentToolUseId` se guardan en el store (el indicador principal las sigue ignorando) y `useChatMessages` arma `subagentCurrentActivity` por tarjeta, que se limpia con la entrada que la resuelve. `SubagentPanel` muestra la tool en curso en el encabezado, el último texto con la tarjeta plegada y el resultado de una tarea en background desde `taskStatus.summary`. Guion `subagentes-paralelos` en el CLI falso (el plan pedía un turno real; con el gobernador en rojo se usó el falso). El check 1 del agente buscaba "Read" en todo el panel y daba verde a medias sin el arreglo; se endureció a leer el encabezado de cada tarjeta (`e2e/evidencia/revalida-fase-6/`).

**Fase 7, cliente, parcial (06-oct):** paso 5 del cliente hecho: un `protocol_error` `TMUX_*` ya no hace `setRunsInTmux(false)` (solo `TMUX_PROVIDER_UNSUPPORTED` vuelve a stream-json); el mensaje queda `failed`. Test en `messageDeliveryStatus.test.tsx`, rojo sin el cambio. Falta: que el composer mande durante el turno, `queued_command` como "Enviado", indicador y borrador tmux; y todo el E2E `tmux/*`, que no corre con el gobernador en rojo.

**Fase 7, cliente, resto (06-oct), worktree `wf_da5db4bc-5d1-1`, merge `fc4be5eb`:** el composer manda por `chat.send-tmux` durante el turno si la sesión corre en tmux (sin adjuntos ni edición en curso; headless sigue encolando). `removeQueuedCommandEchoes` retira la fila `tmux_queued_<uuid>` cuando el turno real queda en el historial. Un `activity` idle del pane ya no fija "Pensando". El borrador `tmux-borrador:` se reemplaza con `setStreamDraft` en vez de concatenarse, y `stream_reemplazo` lo descarta con `discardStreamDraft`. 9 tests nuevos: los 5 que cubren el arreglo dan rojo sin él (revalidado desde el orquestador revirtiendo los cinco archivos de `hooks/` y `utils/`) y los otros 4 son guardas de regresión. La regresión headless en la instancia aislada `:3950` dio 8/8, 4/4 y 6/6 (`e2e/evidencia/fase-7-cliente/`). **No corrió ningún `tmux/*`:** `rafaga` y las micro-tasks de la cola y de `queued_command` siguen abiertas hasta que el gobernador salga del rojo. `e2e/evidencia/fase-5-actividad2/` es la corrida del verde falso de la Fase 5: se conserva como antecedente, no como prueba.

**Fase 11, paso 1 (06-oct), worktree `agent-a45bb82d…`, merge `3725b4d4`:** namespace `ds` y screens `ds-*` en `tailwind.config.js`, variables `--ds-*` claro/oscuro y materiales `.ds-material-*` en `index.css`, fuera Merriweather de `index.html` y `font-serif` → `font-sans` en los 5 archivos que lo usaban. Los 35 avisos `css-syntax-error` del build están también en `diseno/propio` sin este cambio (dos builds comparados): no son nuevos. Falta una captura en oscuro: el humo con CLI falso solo sacó el claro.

**Fase 11, paso 2 (06-oct), merge `2380c32b`:** columna `max-w-3xl` y fondo `ds` en el transcript. La respuesta de Claude va sin burbuja ni avatar y la del usuario con tinte plano. El markdown usa tokens `ds`: encabezados, blockquote con el acento y tabla compacta. Bash y los errores de tool pasan a la línea de actividad `border-l-2`, sin tarjeta. El subagente queda como tarjeta propia, que es la única excepción del boceto. Se agregó el guion `markdown` al CLI falso. Revalidado: vitest 744/744, tsc limpio, bundle 1559 KB br bajo el techo, y capturas 390/1280 × claro/oscuro contra el boceto (`e2e/evidencia/fase-11-chat/`). Quedan abiertos tres puntos: el ícono del subagente sigue en violeta y el boceto lo pide gris; `prose-red`/`prose-gray` sin pasar a `ds`; y `WorkflowPanel.tsx` con el patrón viejo.
**Hallazgo al revisar las capturas (sin resolver):** con `subagentes-paralelos`, las filas internas de los subagentes ("Soy el subagente A…", `echo a`, `Read b.txt`) también aparecen en la columna principal, fuera de las tarjetas. No lo causó el paso 2: es render de la Fase 6. Falta ver si pasa con un turno real o es un artefacto del CLI falso.
**`headless/recarga` (06-oct, `08800af1`):** daba rojo desde la Fase 5 paso 7 sin que hubiera regresión. La etiqueta se calla mientras llega texto, el guion `lento` tipea enseguida y el check buscaba la palabra "Thinking". Ahora mira el Stop del indicador (el único con atajo `esc`) y tiene un control negativo: al cerrar el turno, el Stop se va. Verde los 3 checks (`e2e/evidencia/revalida-recarga-stop/`), con la captura mostrando el indicador vivo.

**Corte de tmux del 06-oct:** no lo causó esta ejecución. El servidor de tmux murió a las 04:13 por OOM (un pane del 30-sep llegó a 4,1 GB; cayeron también `cloudcli`, `norte`, `servidor-code` y `syncthing`, y el systemd de usuario se reinició a las 04:17). Entre 04:17 y 15:09 no se abrió ningún pane. Ningún transcript ejecutó `kill-server`; vitest solo corre `src/`. Queda el riesgo latente de que los tests de server usen el socket por defecto.

**Fase 4, check del turno real (06-oct):** Leandro levantó `:3901` con el token desde su shell. Turno real con Sonnet: 13 `thinking_delta` con texto en los frames (`e2e/evidencia/revalida-fase-4/`). Dos cambios al escenario: (1) la sesión inicial la escribe el CLI falso con `E2E_FALSO_MODELO=sonnet`, porque el `claude -p` del shell de la suite no tiene token y la UI hereda el modelo de la sesión; (2) el prompt ya no pide "pensalo paso a paso": el safeguard de Sonnet lo cortó como `reasoning_extraction`. El thinking resumido lo pide el server por protocolo, no hace falta pedirlo en el texto. El segundo check (razonamiento visible) hoy detecta el "Thinking…" del indicador: lo endurece la revalidación de la Fase 5.

---

## Continuación de Sesión

**Fases completadas:** 1, 2, 3, 4, 5, 6, 8, 10. La 7 tiene server y cliente hechos y le falta solo el E2E `tmux/*`. De la 11 están hechos los pasos 1 (tokens) y 2 (chat).
**Fase actual:** 9 (cuestionario, en un worktree) y 11, pasos 3 a 6.
**Próximo paso exacto:** Fase 9 en un worktree. Su paso 1 necesita un turno real, o sea `:3901` con token, y los escenarios `pregunta/tmux-*` crean panes, así que esperan al gobernador. Después la 11: el paso 4 (header+barra) puede ir ya, y el 3 (`Cuestionario`) va después de la 9 porque comparte el composer. Seguimiento: las filas de los subagentes que se escapan a la columna principal.
**Bloqueantes:** los escenarios `tmux/*` y `pregunta/tmux-*` no corren con el gobernador en rojo (`exigirGobernadorNoRojo`). La Fase 12 necesita que Leandro reinicie `:3001` (con `npm run build` antes).
**Micro-tasks pendientes:** 14 de 41 (las dos de tmux esperan `tmux/rafaga`).
