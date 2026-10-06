# Evidencia E2E — revalida-fase-9-y-7-tmux

Fecha: 2026-10-06T19:10:02.898Z · Escenarios: 4 · Gobernador: verde (pace 70%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 9 |
| ❌ falla | 3 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `linea-base/4158e887` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](linea-base-4158e887/simple-pregunta.png) |  |
| `linea-base/4158e887` | simple: llega la elegida | ✅ pasa | [frames-0.json](linea-base-4158e887/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `linea-base/4158e887` | múltiple: llegan las 3 tildadas | ❌ falla | [multi-pregunta.png](linea-base-4158e887/multi-pregunta.png) | {"ultima":"ELEGISTE Pera\nMD"} |
| `linea-base/4158e887` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](linea-base-4158e887/final.png) | {"pregunta":1} |
| `pregunta/tmux-multi` | llegan las 3 tildadas | ❌ falla | [pregunta.png](pregunta-tmux-multi/pregunta.png) | {"ultima":""} |
| `pregunta/tmux-multi` | la pregunta y la respuesta se ven una vez | ❌ falla | [final.png](pregunta-tmux-multi/final.png) | {"pregunta":2} |
| `pregunta/tmux-simple` | la pregunta llega a la tarjeta | ✅ pasa | [pregunta.png](pregunta-tmux-simple/pregunta.png) |  |
| `pregunta/tmux-simple` | llega la elegida | ✅ pasa | [final.png](pregunta-tmux-simple/final.png) | {"ultima":"ELEGISTE Pera\nMD"} |
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,1,1,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ✅ pasa | [final.png](tmux-rafaga/final.png) | {"enDom":[1,1,1,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["1284160"],"despues":["1284160"]} |
| `tmux/rafaga` | todos contestados | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[1,1,1,1,1]} |
