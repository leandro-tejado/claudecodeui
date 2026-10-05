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
