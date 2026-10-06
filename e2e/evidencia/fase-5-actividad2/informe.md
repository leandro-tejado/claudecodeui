# Evidencia E2E — fase-5-actividad2

Fecha: 2026-10-06T13:36:01.298Z · Escenarios: 1 · Gobernador: rojo (pace 155% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 8 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ✅ pasa | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":1928,"tResp":2879} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/actividad` | (herramienta) el indicador está visible antes del primer token | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | el indicador muestra el nombre de la tool mientras corre | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | tras ≥800 ms sin texto nuevo, el indicador vuelve a verse ("Thinking…") | ✅ pasa | [herramienta-reaparece-tras-hueco.png](headless-actividad/herramienta-reaparece-tras-hueco.png) | {"tReaparece":855} |
| `headless/actividad` | (herramienta) la respuesta final aparece una vez | ✅ pasa | [herramienta-final.png](headless-actividad/herramienta-final.png) |  |
