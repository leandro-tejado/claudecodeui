# Evidencia E2E — fase11-paso2-final

Fecha: 2026-10-06T17:07:08.220Z · Escenarios: 8 · Gobernador: rojo (cuota pelada: 100% consumido (>= 98%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 28 |
| ❌ falla | 1 |
| ⏸ bloqueado | 2 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `falso/6000-deltas` | sin `history_truncated` al reconectar | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) |  |
| `falso/6000-deltas` | el final del run ("6000") aparece exactamente una vez | ✅ pasa | [final.png](falso-6000-deltas/final.png) | {"finales":1,"msFin":3346} |
| `falso/6000-deltas` | el run entero está en una sola fila | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) | {"filas":1} |
| `falso/humo` | llega `complete` en ≤ 10 s | ✅ pasa | [frames-0.json](falso-humo/frames-0.json) | {"ms":669} |
| `falso/humo` | la respuesta aparece exactamente una vez | ✅ pasa | [final.png](falso-humo/final.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [subagente-a-mitad-a-mitad.png](falso-intercalados/subagente-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [subagente-a-mitad-al-terminar.png](falso-intercalados/subagente-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | subagente-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [subagente-a-mitad-refrescado.png](falso-intercalados/subagente-a-mitad-refrescado.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [stderr-a-mitad-a-mitad.png](falso-intercalados/stderr-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [stderr-a-mitad-al-terminar.png](falso-intercalados/stderr-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | stderr-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [stderr-a-mitad-refrescado.png](falso-intercalados/stderr-a-mitad-refrescado.png) | {"filas":1} |
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ✅ pasa | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":2017,"tResp":2978} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/actividad` | (herramienta) el indicador está visible antes del primer token | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | el indicador muestra el nombre de la tool mientras corre | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | tras ≥800 ms sin texto nuevo, el indicador vuelve a verse ("Thinking…") | ✅ pasa | [herramienta-reaparece-tras-hueco.png](headless-actividad/herramienta-reaparece-tras-hueco.png) | {"tReaparece":843} |
| `headless/actividad` | (herramienta) la respuesta final aparece una vez | ✅ pasa | [herramienta-final.png](headless-actividad/herramienta-final.png) |  |
| `headless/pensamiento` | llegan deltas de pensamiento con texto | ⏸ bloqueado | — | sin --con-cuota |
| `headless/pensamiento` | el razonamiento se ve antes de la respuesta | ⏸ bloqueado | — | sin --con-cuota |
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ❌ falla | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
| `headless/subagente` | a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo) | ✅ pasa | [a-mitad.png](headless-subagente/a-mitad.png) | {"vistoBash":true,"vistoRead":true,"cruzado":false} |
| `headless/subagente` | dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto | ✅ pasa | [paralelo.png](headless-subagente/paralelo.png) | {"tarjetaA":1,"tarjetaB":1,"vistoTextoA":true,"vistoTextoB":true} |
| `headless/subagente` | cada tarjeta se cierra con el resultado de su propio subagente | ✅ pasa | [final.png](headless-subagente/final.png) | {"resultadoA":1,"resultadoB":1} |
| `headless/subagente` | la respuesta principal no se parte ni se duplica con subagentes de por medio | ✅ pasa | [final.png](headless-subagente/final.png) | {"apariciones":1} |
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":22,"largos":"48,59,72,82,90,98,107,118,130,138,145,156,164,173,180,192,198,206,215,221,234,236,236,236,236"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":true} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":true,"msFin":4793} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
