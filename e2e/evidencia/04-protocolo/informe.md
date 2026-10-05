# Evidencia E2E — 04-protocolo

Actualizado: 2026-10-05T20:40:01.770Z · Gobernador: rojo

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 22 |
| ❌ falla | 5 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `falso/6000-deltas` | sin `history_truncated` al reconectar | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) |  |
| `falso/6000-deltas` | el final del run ("6000") aparece exactamente una vez | ✅ pasa | [final.png](falso-6000-deltas/final.png) | {"finales":1,"msFin":3292} |
| `falso/6000-deltas` | el run entero está en una sola fila | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) | {"filas":1} |
| `cola/headless` | el mensaje encolado se contesta | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"segundos":8} |
| `cola/headless` | cada mensaje del usuario aparece una vez | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"u2":1} |
| `cola/headless` | cada respuesta aparece una vez | ✅ pasa | [final.png](cola-headless/final.png) | {"r1":1,"r2":1} |
| `cola/headless` | el segundo mensaje se manda una sola vez por el WS | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"envios":0} |
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ❌ falla | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":2546,"tResp":2835} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ✅ pasa | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
| `headless/subagente` | el texto del subagente se ve antes de que termine el turno | ✅ pasa | [subagente-en-vivo.png](headless-subagente/subagente-en-vivo.png) | {"tSub":1860,"fin":3248} |
| `headless/subagente` | hay una tarjeta del subagente con su descripción | ✅ pasa | [final.png](headless-subagente/final.png) | {"tarjeta":1} |
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":21,"largos":"31,37,49,55,66,72,79,91,97,109,114,120,133,139,151,157,163,174,174,174,26,32,44,49,55"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":false} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":false,"msFin":4751} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
| `pregunta/headless` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-headless/escritorio-pregunta.png) |  |
| `pregunta/headless` | escritorio: la pregunta pendiente se ve una sola vez | ❌ falla | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":2} |
| `pregunta/headless` | escritorio: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | escritorio: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [escritorio-respondida.png](pregunta-headless/escritorio-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/headless` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-headless/movil-pregunta.png) |  |
| `pregunta/headless` | movil: la pregunta pendiente se ve una sola vez | ❌ falla | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":2} |
| `pregunta/headless` | movil: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | movil: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [movil-respondida.png](pregunta-headless/movil-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
