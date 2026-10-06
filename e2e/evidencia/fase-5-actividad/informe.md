# Evidencia E2E — fase-5-actividad

Fecha: 2026-10-06T13:02:10.264Z · Escenarios: 1 · Gobernador: rojo (pace 147% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 3 |
| ❌ falla | 1 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ✅ pasa | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":1907,"tResp":2856} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ❌ falla | [final.png](headless-actividad/final.png) |  |
