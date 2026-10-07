# Evidencia E2E — revalida-f11-paso3-tmux

Fecha: 2026-10-07T00:38:37.706Z · Escenarios: 3 · Gobernador: verde (pace 23%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 8 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `linea-base/4158e887` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](linea-base-4158e887/simple-pregunta.png) |  |
| `linea-base/4158e887` | simple: llega la elegida | ✅ pasa | [frames-0.json](linea-base-4158e887/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `linea-base/4158e887` | múltiple: llegan las 3 tildadas | ✅ pasa | [multi-pregunta.png](linea-base-4158e887/multi-pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nCuota: 7d en 58% con 34% de la semana transcurrida, proyecta 172% al reset (en 111 h). Convien"} |
| `linea-base/4158e887` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](linea-base-4158e887/final.png) | {"pregunta":1} |
| `pregunta/tmux-multi` | llegan las 3 tildadas | ✅ pasa | [pregunta.png](pregunta-tmux-multi/pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nMD"} |
| `pregunta/tmux-multi` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](pregunta-tmux-multi/final.png) | {"pregunta":1} |
| `pregunta/tmux-simple` | la pregunta llega a la tarjeta | ✅ pasa | [pregunta.png](pregunta-tmux-simple/pregunta.png) |  |
| `pregunta/tmux-simple` | llega la elegida | ✅ pasa | [final.png](pregunta-tmux-simple/final.png) | {"ultima":"ELEGISTE Pera\nMD"} |
