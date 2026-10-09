# Evidencia E2E — final-3001

Fecha: 2026-10-09T12:53:41.890Z · Escenarios: 42 · Gobernador: verde (pace 14%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 60 |
| ❌ falla | 8 |
| ⏸ bloqueado | 26 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `a11y/chat` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `barra/archivar` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `barra/componentes` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `barra/estado-vivo` | con el tmux vivo, la fila NO dice "dormida" | ✅ pasa | [tmux-vivo.png](barra-estado-vivo/tmux-vivo.png) | {"rotuloConVida":"libre"} |
| `barra/estado-vivo` | al matar el pane, la fila pasa a "dormida" sin recargar en ≤ 25000 ms | ❌ falla | [antes-dormir.png](barra-estado-vivo/antes-dormir.png) [despues-dormir.png](barra-estado-vivo/despues-dormir.png) | {"msHastaDormida":null,"topeMs":25000,"dormidaOk":true,"nombre":"e2e-estado-ejecutora-1","sid":"8aeefa3f-3df7-4b42-b08e-89b801610d0a"} |
| `barra/nombres` | la fila de la barra muestra el título humano, no el prompt crudo ni un id | ✅ pasa | [barra-prosa.png](barra-nombres/barra-prosa.png) | {"tituloProsa":"Psicrómetro: definición","derivado":"Explicame en una frase qué es un psicrómetro","aiTitles":["Psicrómetro: definición"],"mensaje":"Explicame en una frase qué es un psicrómetro."} |
| `barra/nombres` | tmux show-options -v @titulo devuelve ese mismo título | ✅ pasa | [frames-0.json](barra-nombres/frames-0.json) | {"tituloTmuxProsa":"Psicrómetro: definición","enLaBarra":"Psicrómetro: definición","nombre":"e2e-nombre-prosa-ejecutora-1"} |
| `barra/nombres` | un mensaje en modo bash (<bash-input>) no deja un título crudo con etiquetas en la barra | ✅ pasa | [barra-bash.png](barra-nombres/barra-bash.png) | {"tituloBash":"Comando: echo hola-57a7gb","esperado":"Comando: echo hola-57a7gb","sinEtiquetasCrudas":true} |
| `barra/nombres` | tmux show-options -v @titulo del modo bash tampoco queda crudo | ✅ pasa | [frames-0.json](barra-nombres/frames-0.json) | {"tituloTmuxBash":"Comando: echo hola-57a7gb","esperado":"Comando: echo hola-57a7gb","nombre":"e2e-nombre-bash-ejecutora-1"} |
| `barra/orquestador` | el escenario corre sin excepción: locator.click: Timeout 30000ms exceeded. | ❌ falla | [error-0.png](barra-orquestador/error-0.png) | locator.click: Timeout 30000ms exceeded. \| Call log: \| [2m  - waiting for locator('[data-testid="sidebar-project-row"]').filter({ hasText: 'e2e-proyecto' }).first()[22m \|  |
| `barra/pestana-oculta` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `cola/headless` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `cuota/en-vivo` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `cuota/header` | el escenario corre sin excepción: locator.click: Timeout 30000ms exceeded. | ❌ falla | [error-0.png](cuota-header/error-0.png) | locator.click: Timeout 30000ms exceeded. \| Call log: \| [2m  - waiting for getByText('e2e-proyecto', { exact: true }).first()[22m \|  |
| `cuota/sin-turnos` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `cuota/vieja` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `diseno/capturas` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `falso/6000-deltas` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `falso/humo` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `falso/intercalados` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `headless/actividad` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `headless/pensamiento` | el escenario corre sin excepción: ENOENT: no such file or directory, open '/tmp/cloudcli-e2e/pid-3901' | ❌ falla | — | Error: ENOENT: no such file or directory, open '/tmp/cloudcli-e2e/pid-3901' \|     at Object.readFileSync (node:fs:440:20) \|     at Module.correr (file:///home/leantejado/cloudcli/e2e/escenarios/headless/pensamiento.mjs |
| `headless/recarga` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `headless/subagente` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `headless/tipeo` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `linea-base/4158e887` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](linea-base-4158e887/simple-pregunta.png) |  |
| `linea-base/4158e887` | simple: llega la elegida | ✅ pasa | [frames-0.json](linea-base-4158e887/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `linea-base/4158e887` | múltiple: llegan las 3 tildadas | ✅ pasa | [multi-pregunta.png](linea-base-4158e887/multi-pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nAviso de cuota: la ventana de 7 días va en 82% con el 70% de la semana transcurrida, y proyect"} |
| `linea-base/4158e887` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](linea-base-4158e887/final.png) | {"pregunta":1} |
| `pregunta/headless` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/modos` | default: la pregunta llega y Claude repite lo elegido | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/modos` | auto: la pregunta llega y Claude repite lo elegido | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/modos` | bypassPermissions: la pregunta llega y Claude repite lo elegido | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/otra` | el texto libre de "Otra" llega literal, sin romperse | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/recarga` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/sin-repetidos` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `pregunta/tmux-multi` | llegan las 3 tildadas | ✅ pasa | [pregunta.png](pregunta-tmux-multi/pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nMD"} |
| `pregunta/tmux-multi` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](pregunta-tmux-multi/final.png) | {"pregunta":1} |
| `pregunta/tmux-simple` | la pregunta llega a la tarjeta | ✅ pasa | [pregunta.png](pregunta-tmux-simple/pregunta.png) |  |
| `pregunta/tmux-simple` | llega la elegida | ✅ pasa | [final.png](pregunta-tmux-simple/final.png) | {"ultima":"ELEGISTE Pera\nMD"} |
| `pregunta/tmux` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](pregunta-tmux/simple-pregunta.png) |  |
| `pregunta/tmux` | simple: llega la elegida | ✅ pasa | [frames-0.json](pregunta-tmux/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `pregunta/tmux` | múltiple: llegan las 3 tildadas | ✅ pasa | [multi-pregunta.png](pregunta-tmux/multi-pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nCuota: 7d va en 82% con 70% de la semana transcurrida, así que proyecta 118% al reset (en 51 h"} |
| `pregunta/tmux` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](pregunta-tmux/final.png) | {"pregunta":1} |
| `tmux/adjunto` | el mensaje del usuario aparece una vez en el DOM (una imagen) | ✅ pasa | [dom-1.png](tmux-adjunto/dom-1.png) | {"filasUser":1} |
| `tmux/adjunto` | no aparece el error de "no apareció" en el DOM (una imagen) | ✅ pasa | [dom-1.png](tmux-adjunto/dom-1.png) | {"filasError":0} |
| `tmux/adjunto` | el JSONL tiene la fila user con el nonce y un bloque de imagen (una imagen) | ✅ pasa | [frames-0.json](tmux-adjunto/frames-0.json) | {"filaUser":true,"tieneBloqueImagen":true} |
| `tmux/adjunto` | Claude contesta (una imagen) | ✅ pasa | [respuesta-1.png](tmux-adjunto/respuesta-1.png) | {"finMs":3691} |
| `tmux/adjunto` | el mensaje del usuario aparece una vez en el DOM (dos imágenes) | ❌ falla | [dom-2.png](tmux-adjunto/dom-2.png) | {"filasUser":0} |
| `tmux/adjunto` | no aparece el error de "no apareció" en el DOM (dos imágenes) | ✅ pasa | [dom-2.png](tmux-adjunto/dom-2.png) | {"filasError":0} |
| `tmux/adjunto` | el JSONL tiene la fila user con el nonce y un bloque de imagen (dos imágenes) | ❌ falla | [frames-0.json](tmux-adjunto/frames-0.json) | {"filaUser":false,"tieneBloqueImagen":false} |
| `tmux/adjunto` | Claude contesta (dos imágenes) | ✅ pasa | [respuesta-2.png](tmux-adjunto/respuesta-2.png) | {"finMs":8788} |
| `tmux/commits` | 8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió | ✅ pasa | [enviado.png](tmux-commits/enviado.png) | {"enviadoMs":847} |
| `tmux/commits` | 62d63c69: con la sugerencia visible, el mensaje sale y se contesta | ✅ pasa | [final.png](tmux-commits/final.png) | {"sugerencia":"Respondé solo: p9u4ax","finMs":2319,"respuestaVisible":true} |
| `tmux/en-vivo` | "pensando" visible ≤ 2 s después de enviar | ✅ pasa | [indicador.png](tmux-en-vivo/indicador.png) | {"tInd":735} |
| `tmux/en-vivo` | el texto crece en ≥ 3 muestras | ✅ pasa | [frames-0.json](tmux-en-vivo/frames-0.json) | {"distintas":7,"largos":"16,16,16,16,16,16,190,224,400,608,815,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,884,8 |
| `tmux/en-vivo` | al final, una sola fila de respuesta | ✅ pasa | [final.png](tmux-en-vivo/final.png) | {"filas":1} |
| `tmux/latencia` | la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL | ✅ pasa | [final.png](tmux-latencia/final.png) | {"jsonlMs":4754,"domMs":5042,"latenciaMs":288} |
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,1,1,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ✅ pasa | [final.png](tmux-rafaga/final.png) | {"enDom":[1,1,1,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["4012822"],"despues":["4012822"]} |
| `tmux/rafaga` | todos contestados | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[1,1,1,1,1]} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true} |
| `tmux/recarga` | tras recargar, el indicador sigue | ❌ falla | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
| `tmux/turno-corto` | cada turno pasa a libre ≤ 3 s después de que se ve la respuesta | ✅ pasa | [final.png](tmux-turno-corto/final.png) | [-34,-91,-132] |
| `tmux/turno-corto` | cada respuesta aparece una vez | ✅ pasa | [frames-0.json](tmux-turno-corto/frames-0.json) | [1,1,1] |
| `visual/bocetos` | chat: movil/light sin scroll horizontal | ✅ pasa | [chat-movil-light.png](visual-bocetos/chat-movil-light.png) | {"desborde":0} |
| `visual/bocetos` | chat: movil/light consola sin errores | ✅ pasa | [chat-movil-light.png](visual-bocetos/chat-movil-light.png) | [] |
| `visual/bocetos` | chat: movil/dark sin scroll horizontal | ✅ pasa | [chat-movil-dark.png](visual-bocetos/chat-movil-dark.png) | {"desborde":0} |
| `visual/bocetos` | chat: movil/dark consola sin errores | ✅ pasa | [chat-movil-dark.png](visual-bocetos/chat-movil-dark.png) | [] |
| `visual/bocetos` | chat: escritorio/light sin scroll horizontal | ✅ pasa | [chat-escritorio-light.png](visual-bocetos/chat-escritorio-light.png) | {"desborde":0} |
| `visual/bocetos` | chat: escritorio/light consola sin errores | ✅ pasa | [chat-escritorio-light.png](visual-bocetos/chat-escritorio-light.png) | [] |
| `visual/bocetos` | chat: escritorio/dark sin scroll horizontal | ✅ pasa | [chat-escritorio-dark.png](visual-bocetos/chat-escritorio-dark.png) | {"desborde":0} |
| `visual/bocetos` | chat: escritorio/dark consola sin errores | ✅ pasa | [chat-escritorio-dark.png](visual-bocetos/chat-escritorio-dark.png) | [] |
| `visual/bocetos` | header-barra: movil/light sin scroll horizontal | ✅ pasa | [header-barra-movil-light.png](visual-bocetos/header-barra-movil-light.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: movil/light consola sin errores | ✅ pasa | [header-barra-movil-light.png](visual-bocetos/header-barra-movil-light.png) | [] |
| `visual/bocetos` | header-barra: movil/dark sin scroll horizontal | ✅ pasa | [header-barra-movil-dark.png](visual-bocetos/header-barra-movil-dark.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: movil/dark consola sin errores | ✅ pasa | [header-barra-movil-dark.png](visual-bocetos/header-barra-movil-dark.png) | [] |
| `visual/bocetos` | header-barra: escritorio/light sin scroll horizontal | ✅ pasa | [header-barra-escritorio-light.png](visual-bocetos/header-barra-escritorio-light.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: escritorio/light consola sin errores | ✅ pasa | [header-barra-escritorio-light.png](visual-bocetos/header-barra-escritorio-light.png) | [] |
| `visual/bocetos` | header-barra: escritorio/dark sin scroll horizontal | ✅ pasa | [header-barra-escritorio-dark.png](visual-bocetos/header-barra-escritorio-dark.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: escritorio/dark consola sin errores | ✅ pasa | [header-barra-escritorio-dark.png](visual-bocetos/header-barra-escritorio-dark.png) | [] |
| `visual/bocetos` | cuestionario: movil/light sin scroll horizontal | ✅ pasa | [cuestionario-movil-light.png](visual-bocetos/cuestionario-movil-light.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: movil/light consola sin errores | ✅ pasa | [cuestionario-movil-light.png](visual-bocetos/cuestionario-movil-light.png) | [] |
| `visual/bocetos` | cuestionario: movil/dark sin scroll horizontal | ✅ pasa | [cuestionario-movil-dark.png](visual-bocetos/cuestionario-movil-dark.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: movil/dark consola sin errores | ✅ pasa | [cuestionario-movil-dark.png](visual-bocetos/cuestionario-movil-dark.png) | [] |
| `visual/bocetos` | cuestionario: escritorio/light sin scroll horizontal | ✅ pasa | [cuestionario-escritorio-light.png](visual-bocetos/cuestionario-escritorio-light.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: escritorio/light consola sin errores | ✅ pasa | [cuestionario-escritorio-light.png](visual-bocetos/cuestionario-escritorio-light.png) | [] |
| `visual/bocetos` | cuestionario: escritorio/dark sin scroll horizontal | ✅ pasa | [cuestionario-escritorio-dark.png](visual-bocetos/cuestionario-escritorio-dark.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: escritorio/dark consola sin errores | ✅ pasa | [cuestionario-escritorio-dark.png](visual-bocetos/cuestionario-escritorio-dark.png) | [] |
| `visual/chat` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `visual/cuestionario` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `visual/header-barra` | (todo el escenario) | ⏸ bloqueado | — | usa el CLI falso de :3902; :3001 corre el Claude real |
| `visual/salidas` | el escenario corre sin excepción: locator.click: Timeout 30000ms exceeded. | ❌ falla | [error-0.png](visual-salidas/error-0.png) | locator.click: Timeout 30000ms exceeded. \| Call log: \| [2m  - waiting for getByText('e2e-proyecto', { exact: true }).first()[22m \|  |
---

## Lectura — Fase 12, paso 4: pasada contra `:3001` (9-oct-2026, 14:43–14:53)

Corrida por Leandro desde ttyd, con el login solo en el entorno de esa corrida. Build `c215ade5`, reiniciado el 8-oct a las 22:36.

**Resultado:** 60 bien, 8 mal y 26 bloqueados. Los bloqueados son los escenarios del CLI falso: hablan con guiones que el Claude real de `:3001` no tiene, y ya están en verde en `:3902` (`final-3901`).

**Limpieza, verificada al terminar:** 0 sesiones `e2e-*` vivas en el socket por defecto, 0 JWT en esta carpeta, 0 entradas `e2e-*` en `~/.cache/aos/hibernadas.json`, ningún archivo de token del 3001 en `/tmp/cloudcli-e2e`. La cuota semanal de optimum siguió en 82 %.

### Las 8 fallas

| Escenario | Qué pasó | De quién es |
|---|---|---|
| `barra/orquestador`, `cuota/header` y `visual/salidas` (3) | No encuentran `e2e-proyecto` en la barra. En `:3001` la carpeta del proyecto ya estaba dada de alta con el nombre `proyecto` (39 sesiones de corridas viejas); `create-project` dio 409 y no le puso el nombre | **Arnés**. Arreglado: con 409 lo renombra. Falta volver a correrlo |
| `headless/pensamiento` (1) | Buscaba el pid de la instancia de prueba (`/tmp/cloudcli-e2e/pid-3901`) | **Arnés**. Arreglado: contra `:3001` usa el `MainPID` del servicio. Falta volver a correrlo |
| `barra/estado-vivo` (1) | Después de `orquestar.py dormir`, la fila sigue diciendo "libre" a los 25 s. En `:3901` pasó a "dormida" en 3,2 s | **Abierto**. `dormir` escribe `hibernadas.json` en `~/.cache/aos/`, el directorio que vigila `:3001`. Hay que ver por qué no cambia el estado |
| `tmux/adjunto`, con dos imágenes (2) | Con una imagen pasa entera. Con dos, Claude contesta, pero el mensaje del usuario no aparece ni en el DOM ni en el JSONL | **Abierto**. En `:3901` pasó 8/8 |
| `tmux/recarga` (1) | El ack dice que está procesando, pero tras recargar no sigue el indicador | **Abierto**. En `:3901` pasó |

**Ruido del entorno real, no de CloudCLI:** en `:3001` están activos los hooks de Leandro. El de cuota metió la línea "Cuota: 7d en 82 %…" dentro de una respuesta de prueba (`barra-estado-vivo/despues-dormir.png`).

### Para la próxima pasada

Correr solo los 7 escenarios en rojo, con el arnés ya arreglado:

```
cd ~/cloudcli && read -rp 'usuario: ' U && read -rsp 'contraseña: ' P && echo && CLOUDCLI_USER="$U" CLOUDCLI_PASS="$P" CLOUDCLI_URL=http://127.0.0.1:3001 node e2e/correr.mjs barra/orquestador barra/estado-vivo cuota/header visual/salidas headless/pensamiento tmux/adjunto tmux/recarga --con-cuota --corrida final-3001; unset U P
```
