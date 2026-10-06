# Evidencia E2E — fase-7-cliente

Actualizado: 2026-10-06T15:12:20.674Z · Gobernador: rojo

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 18 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ✅ pasa | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":1944,"tResp":2897} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/actividad` | (herramienta) el indicador está visible antes del primer token | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | el indicador muestra el nombre de la tool mientras corre | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | tras ≥800 ms sin texto nuevo, el indicador vuelve a verse ("Thinking…") | ✅ pasa | [herramienta-reaparece-tras-hueco.png](headless-actividad/herramienta-reaparece-tras-hueco.png) | {"tReaparece":848} |
| `headless/actividad` | (herramienta) la respuesta final aparece una vez | ✅ pasa | [herramienta-final.png](headless-actividad/herramienta-final.png) |  |
| `headless/subagente` | a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo) | ✅ pasa | [a-mitad.png](headless-subagente/a-mitad.png) | {"vistoBash":true,"vistoRead":true,"cruzado":false} |
| `headless/subagente` | dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto | ✅ pasa | [paralelo.png](headless-subagente/paralelo.png) | {"tarjetaA":1,"tarjetaB":1,"vistoTextoA":true,"vistoTextoB":true} |
| `headless/subagente` | cada tarjeta se cierra con el resultado de su propio subagente | ✅ pasa | [final.png](headless-subagente/final.png) | {"resultadoA":1,"resultadoB":1} |
| `headless/subagente` | la respuesta principal no se parte ni se duplica con subagentes de por medio | ✅ pasa | [final.png](headless-subagente/final.png) | {"apariciones":1} |
| `falso/intercalados` | subagente-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [subagente-a-mitad-a-mitad.png](falso-intercalados/subagente-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [subagente-a-mitad-al-terminar.png](falso-intercalados/subagente-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | subagente-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [subagente-a-mitad-refrescado.png](falso-intercalados/subagente-a-mitad-refrescado.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [stderr-a-mitad-a-mitad.png](falso-intercalados/stderr-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [stderr-a-mitad-al-terminar.png](falso-intercalados/stderr-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | stderr-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [stderr-a-mitad-refrescado.png](falso-intercalados/stderr-a-mitad-refrescado.png) | {"filas":1} |
