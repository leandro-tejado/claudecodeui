# Evidencia E2E — 00-linea-base

Actualizado: 2026-10-05T18:36:20.098Z · Gobernador: ambar

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 46 |
| ❌ falla | 22 |
| ⏸ bloqueado | 2 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `barra/archivar` | la sesión archivada sale de la barra ≤ 3 s sin recargar | ❌ falla | [antes.png](barra-archivar/antes.png) [despues.png](barra-archivar/despues.png) | {"status":200,"antes":1,"tBajaMs":null,"trasRecargar":0} |
| `cola/headless` | el mensaje encolado se contesta | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"segundos":11} |
| `cola/headless` | cada mensaje del usuario aparece una vez | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"u2":1} |
| `cola/headless` | cada respuesta aparece una vez | ✅ pasa | [final.png](cola-headless/final.png) | {"r1":1,"r2":1} |
| `cola/headless` | el segundo mensaje se manda una sola vez por el WS | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"envios":0} |
| `falso/6000-deltas` | sin `history_truncated` al reconectar | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) |  |
| `falso/6000-deltas` | el final del run ("6000") aparece exactamente una vez | ✅ pasa | [final.png](falso-6000-deltas/final.png) | {"finales":1,"msFin":3546} |
| `falso/6000-deltas` | el run entero está en una sola fila | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [subagente-a-mitad-a-mitad.png](falso-intercalados/subagente-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [subagente-a-mitad-al-terminar.png](falso-intercalados/subagente-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | subagente-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [subagente-a-mitad-refrescado.png](falso-intercalados/subagente-a-mitad-refrescado.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [stderr-a-mitad-a-mitad.png](falso-intercalados/stderr-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [stderr-a-mitad-al-terminar.png](falso-intercalados/stderr-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | stderr-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [stderr-a-mitad-refrescado.png](falso-intercalados/stderr-a-mitad-refrescado.png) | {"filas":1} |
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ❌ falla | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":2697,"tResp":2904} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ❌ falla | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":0} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ✅ pasa | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
| `headless/subagente` | el texto del subagente se ve antes de que termine el turno | ✅ pasa | [subagente-en-vivo.png](headless-subagente/subagente-en-vivo.png) | {"tSub":1946,"fin":3317} |
| `headless/subagente` | hay una tarjeta del subagente con su descripción | ✅ pasa | [final.png](headless-subagente/final.png) | {"tarjeta":1} |
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":24,"largos":"30,42,48,59,65,71,84,90,102,108,119,119,20,26,32,44,49,61,68,80,86,92,103,109,122"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":false} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":false,"msFin":5213} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
| `pregunta/headless` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-headless/escritorio-pregunta.png) |  |
| `pregunta/headless` | escritorio: la pregunta pendiente se ve una sola vez | ❌ falla | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":2} |
| `pregunta/headless` | escritorio: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | escritorio: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [escritorio-respondida.png](pregunta-headless/escritorio-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/headless` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-headless/movil-pregunta.png) |  |
| `pregunta/headless` | movil: la pregunta pendiente se ve una sola vez | ❌ falla | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":2} |
| `pregunta/headless` | movil: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | movil: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [movil-respondida.png](pregunta-headless/movil-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `cuota/header` | 5 h muestra la lectura fresca del archivo (≤ 15 s, sin reiniciar) | ❌ falla | [primera-lectura.png](cuota-header/primera-lectura.png) | {"ok":false,"ms":null,"ultima":"Ventana de 5 horas: sin dato · Semanal: se renueva a las 07:49 PM"} |
| `cuota/header` | la semanal muestra % (no solo la hora de renovación) | ❌ falla | [frames-0.json](cuota-header/frames-0.json) | {"etiqueta":"Ventana de 5 horas: sin dato · Semanal: se renueva a las 07:49 PM"} |
| `cuota/header` | el header sigue el cambio sin recargar (≤ 15 s) | ❌ falla | [segunda-lectura.png](cuota-header/segunda-lectura.png) | {"ok":false,"ms":null,"ultima":"Ventana de 5 horas: sin dato · Semanal: se renueva a las 07:49 PM"} |
| `cuota/header` | el detalle no dice "sin dato" en ninguna ventana | ❌ falla | [detalle.png](cuota-header/detalle.png) |  |
| `cuota/header` | movil: el header muestra la cuota | ❌ falla | [movil-header.png](cuota-header/movil-header.png) | {"ok":false,"ms":null,"ultima":"Ventana de 5 horas: sin dato · Semanal: se renueva a las 07:49 PM"} |
| `barra/orquestador` | la sesión nueva aparece en la barra ≤ 3 s sin recargar | ❌ falla | [antes.png](barra-orquestador/antes.png) [despues.png](barra-orquestador/despues.png) | {"antes":20,"tFilaMs":4453,"tFrameMs":4433,"nombre":"e2e-orq-ejecutora-1","sid":"ea717b69-ed5f-4277-b623-85482c208ddd"} |
| `tmux/turno-corto` | cada turno pasa a libre ≤ 3 s después de que se ve la respuesta | ❌ falla | [final.png](tmux-turno-corto/final.png) | [-117,null,null] |
| `tmux/turno-corto` | cada respuesta aparece una vez | ✅ pasa | [frames-0.json](tmux-turno-corto/frames-0.json) | [1,1,1] |
| `tmux/latencia` | la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL | ❌ falla | [final.png](tmux-latencia/final.png) | {"jsonlMs":2341,"domMs":6616,"latenciaMs":4275} |
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,0,1,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ❌ falla | [final.png](tmux-rafaga/final.png) | {"enDom":[1,0,1,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["319769"],"despues":["319769"]} |
| `tmux/rafaga` | todos contestados | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[1,0,0,1,0]} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ❌ falla | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":false,"runsInTmux":true} |
| `tmux/recarga` | tras recargar, el indicador sigue | ❌ falla | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
| `pregunta/tmux` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](pregunta-tmux/simple-pregunta.png) |  |
| `pregunta/tmux` | simple: llega la elegida | ✅ pasa | [frames-0.json](pregunta-tmux/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `pregunta/tmux` | múltiple: llegan las 3 tildadas | ❌ falla | [multi-pregunta.png](pregunta-tmux/multi-pregunta.png) | {"ultima":"ELEGISTE Pera\nMD"} |
| `pregunta/tmux` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](pregunta-tmux/final.png) | {"pregunta":1} |
| `tmux/commits` | 8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió | ✅ pasa | [enviado.png](tmux-commits/enviado.png) | {"enviadoMs":868} |
| `tmux/commits` | 62d63c69: con la sugerencia visible, el mensaje sale y se contesta | ✅ pasa | [final.png](tmux-commits/final.png) | {"sugerencia":"Respondé solo: 7730be","finMs":6760,"respuestaVisible":true} |
| `tmux/en-vivo` | "pensando" visible ≤ 2 s después de enviar | ✅ pasa | [indicador.png](tmux-en-vivo/indicador.png) | {"tInd":749} |
| `tmux/en-vivo` | el texto crece en ≥ 3 muestras | ❌ falla | [frames-0.json](tmux-en-vivo/frames-0.json) | {"distintas":1,"largos":"1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118,1118, |
| `tmux/en-vivo` | al final, una sola fila de respuesta | ✅ pasa | [final.png](tmux-en-vivo/final.png) | {"filas":1} |
| `headless/pensamiento` | llegan deltas de pensamiento con texto | ⏸ bloqueado | — | la instancia de prueba no tiene CLAUDE_CODE_OAUTH_TOKEN (decisión de Leandro) |
| `headless/pensamiento` | el razonamiento se ve antes de la respuesta | ⏸ bloqueado | — | la instancia de prueba no tiene CLAUDE_CODE_OAUTH_TOKEN (decisión de Leandro) |
| `diseno/capturas` | light/movil: sin scroll horizontal | ✅ pasa | [light-movil-a-mitad.png](diseno-capturas/light-movil-a-mitad.png) [light-movil-final.png](diseno-capturas/light-movil-final.png) | {"desborde":0} |
| `diseno/capturas` | light/movil: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `diseno/capturas` | light/escritorio: sin scroll horizontal | ✅ pasa | [light-escritorio-a-mitad.png](diseno-capturas/light-escritorio-a-mitad.png) [light-escritorio-final.png](diseno-capturas/light-escritorio-final.png) | {"desborde":0} |
| `diseno/capturas` | light/escritorio: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `diseno/capturas` | dark/movil: sin scroll horizontal | ✅ pasa | [dark-movil-a-mitad.png](diseno-capturas/dark-movil-a-mitad.png) [dark-movil-final.png](diseno-capturas/dark-movil-final.png) | {"desborde":0} |
| `diseno/capturas` | dark/movil: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `diseno/capturas` | dark/escritorio: sin scroll horizontal | ✅ pasa | [dark-escritorio-a-mitad.png](diseno-capturas/dark-escritorio-a-mitad.png) [dark-escritorio-final.png](diseno-capturas/dark-escritorio-final.png) | {"desborde":0} |
| `diseno/capturas` | dark/escritorio: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `falso/humo` | llega `complete` en ≤ 10 s | ✅ pasa | [frames-0.json](falso-humo/frames-0.json) | {"ms":591} |
| `falso/humo` | la respuesta aparece exactamente una vez | ✅ pasa | [final.png](falso-humo/final.png) | {"filas":1} |

---

# Lectura de la línea base (05-oct, código de `0868721a` + arnés)

Instancias de prueba: `:3902` (CLI falso, sin cuota) y `:3901` (CLI real; sesiones de tmux creadas con `orquestar.py` como `ejecutora`, Sonnet). Gobernador en ámbar durante las corridas con cuota. Cada número sale de los datos de la tabla de arriba.

## Por punto

| Punto | Escenarios | Qué dio | Causa (diagnóstico del plan) |
|---|---|---|---|
| 1. Comparación con Optimum (streaming) | `headless/tipeo`, `headless/actividad`, `falso/intercalados` | ❌ La fila en streaming **se remonta**: el largo visible cae de 119 a 20 caracteres a mitad del turno y al final es otro nodo. ❌ **0 deltas de pensamiento** reenviados: el razonamiento aparece recién a 2,7 s, 0,2 s antes de la respuesta. ✅ Con subagente o stderr a mitad, la respuesta queda en una sola fila. | Confirmada: key de la fila con timestamp renovado en cada flush; el normalizador solo reenvía `delta.text`; los broadcasts periódicos (`recursos`, `session_upserted`, `usage_window`) cortan el bloque en streaming. |
| 2. Métricas del header | `cuota/header` | ❌ **"Ventana de 5 horas: sin dato"** con un `cuota.json` recién escrito. ❌ El cambio del archivo no llega al header (ni recargando). ❌ La semanal no muestra %. | Confirmada: el server lee `cuota.json` una sola vez por proceso; pasada esa lectura más de 15 min, el cliente dice "sin dato". |
| 3. Subagentes en vivo | `headless/subagente` | ✅ El texto del subagente se ve antes de que termine el turno (1,9 s de 3,3 s). Observación para la Fase 6 (sin check todavía): en la captura `diseno-capturas/dark-movil-final.png` el texto del subagente se pinta como si lo dijera Claude, fuera de su tarjeta, y la tarjeta dice "done" mientras el subagente sigue. | Parcial: el dato llega; la atribución visual es lo que falla. |
| 4. Sesiones del orquestador en la barra | `barra/orquestador`, `barra/archivar` | ❌ La sesión nueva aparece a **4,45 s** (el frame `session_upserted` llega a 4,43 s). ❌ Una sesión archivada desde fuera **nunca** sale de la barra abierta (recargando sí). | Confirmada: el watcher no mira `~/.cache/aos` y archivar no emite nada a la barra. Además: abrir una sesión recién creada da 404 hasta que se indexa (guardado como `[carga]` en `consola-*.txt`). |
| 5. Diseño del cuestionario | `pregunta/headless`, `pregunta/tmux` | Capturas de hoy en `pregunta-*/`. En tmux la tarjeta deja media pantalla vacía a la izquierda en escritorio. | Fase 10 (falta el prompt de ejemplo de Leandro). |
| 6. Respuestas repetidas / selección | `pregunta/headless`, `pregunta/tmux` | ❌ Con la pregunta pendiente, su texto se ve **2 veces** (tarjeta de la herramienta + panel). ✅ Headless: Claude recibe exactamente lo elegido, comillas incluidas. ❌ **Tmux, múltiple con clics a 100 ms: la tercera opción queda en "Sending…"** y el cuestionario no se puede enviar. ✅ Tmux, opción única: llega la elegida. | Confirmada: la huella del prompt de tmux incluye lo tildado → el segundo clic llega STALE en silencio. |
| 7. Sesiones de tmux | `tmux/turno-corto`, `tmux/latencia`, `tmux/en-vivo`, `tmux/rafaga`, `tmux/recarga` | ❌ **Se queda esperando**: tras el primer turno, el server no vuelve a mandar `complete` (turnos 2 y 3 sin `complete` en 30 s; en otra sesión sí llegó: es intermitente). ❌ **Llega todo de golpe**: el largo de la respuesta es 1118 en las 60 muestras. ❌ Latencia JSONL → navegador **4,3 s**. ✅ El indicador "pensando" aparece a 0,75 s. ❌ **Ráfaga**: el 2º mensaje (mandado durante el turno) **desaparece** (ni en el JSONL ni en la pantalla) y el 3º y el 5º no se contestan; un solo proceso `claude` (el doble proceso no se reprodujo esta vez). ❌ Recargar a mitad: el ack dice `isProcessing:false` y el indicador se pierde. | Confirmada: `complecionAnunciada` no se resetea si el turno ya terminó al próximo poll; poll cada 6 s; el dispatcher no distingue el pane; `queued_command` sin manejar; el ack no lee el estado del pane. |
| 8. Diseño general | `diseno/capturas` | ✅ Sin scroll horizontal ni errores de consola en claro/oscuro × móvil/escritorio. Capturas de hoy en `diseno-capturas/`. En móvil, la franja del panel derecho plegado se come ~50 px de 390. | Fase 10/11. |

## Por commit del 5-oct

| Commit | Qué dice | Escenario | Resultado |
|---|---|---|---|
| `1329d865` | respuesta en streaming ni partida ni duplicada | `falso/intercalados`, `headless/tipeo` | ✅ con eventos intercalados no se parte ni duplica; ❌ la fila se remonta a mitad (otra causa: los broadcasts y la key). |
| `ed997afa` / `36795114` | tope de 3 + fijados; la barra se actualiza sola al archivar | tests de `limpieza` (✅ en verde dentro de la suite de server) + `barra/archivar` | ✅ la selección; ❌ la barra abierta no se entera del archivo. |
| `62d63c69` | la sugerencia gris cuenta como cuadro vacío | `tmux/commits` | ✅ con la sugerencia visible en el pane, el mensaje sale y se contesta. |
| `4158e887` | selección múltiple terminable desde la tarjeta tmux | `pregunta/tmux` | ❌ con clics a 100 ms la tercera queda en "Sending…". |
| `8267cbe1` | diálogos del pane y "Enviado" verificado | `tmux/commits` | ✅ "Sent" a 0,87 s. |
| `373dc739` | cola de mensajes | `cola/headless`, `tmux/rafaga` | ✅ headless; ❌ tmux (mensaje perdido). |

## Números de hoy

| Medida | Valor |
|---|---|
| Primera fila de Claude en tmux: JSONL → navegador | 4,3 s |
| Respuesta "OK" en tmux, desde Enviar | 4,2–5,9 s |
| `complete` en tmux tras ver la respuesta | turno 1: −0,1 s; turnos 2 y 3: nunca (> 30 s) |
| Remontajes de la fila en streaming (headless, 36 deltas) | ≥ 1 (cae de 119 a 20 caracteres) |
| Sesión del orquestador en la barra | 4,45 s |
| Sesión archivada fuera de la barra abierta | nunca (> 10 s) |

## Bloqueados

- `headless/pensamiento` (thinking real con Sonnet): la instancia `:3901` no tiene `CLAUDE_CODE_OAUTH_TOKEN` y la suite no maneja credenciales. El `:3001` sí lo tiene. Decide Leandro.

## Fuera de la suite, pero visto al armarla

- La suite de server tiene 2 fallas previas en `shell-tmux.test.ts` (también en un worktree limpio de `HEAD`).
- `:3001` le dio un lugar del tope al proyecto de prueba (17:36 UTC); contenido sin reiniciar, arreglo de fondo en `seleccion.service.ts` pendiente de rebuild + reinicio (detalle en "Cambios realizados" del plan).
