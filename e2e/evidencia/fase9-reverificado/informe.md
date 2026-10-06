# Evidencia E2E — fase9-reverificado

Fecha: 2026-10-06T17:46:19.904Z · Escenarios: 3 · Gobernador: verde (pace 39%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 22 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `pregunta/modos` | default: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [default-pregunta.png](pregunta-modos/default-pregunta.png) |  |
| `pregunta/modos` | default: Claude repite exactamente lo elegido | ✅ pasa | [default-respondida.png](pregunta-modos/default-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | auto: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [auto-pregunta.png](pregunta-modos/auto-pregunta.png) |  |
| `pregunta/modos` | auto: Claude repite exactamente lo elegido | ✅ pasa | [auto-respondida.png](pregunta-modos/auto-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | bypassPermissions: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [bypassPermissions-pregunta.png](pregunta-modos/bypassPermissions-pregunta.png) |  |
| `pregunta/modos` | bypassPermissions: Claude repite exactamente lo elegido | ✅ pasa | [bypassPermissions-respondida.png](pregunta-modos/bypassPermissions-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/otra` | la pregunta llega a la UI | ✅ pasa | [pregunta.png](pregunta-otra/pregunta.png) |  |
| `pregunta/otra` | el texto libre de "Otra" llega literal, sin romperse | ✅ pasa | [respondida.png](pregunta-otra/respondida.png) | {"linea":"Elegiste: Un \"verde azulado\", medio raro ¿no? \| Manzana \| Sí","esperado":"Un \"verde azulado\", medio raro ¿no?"} |
| `pregunta/sin-repetidos` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-sin-repetidos/escritorio-pregunta.png) |  |
| `pregunta/sin-repetidos` | escritorio: "¿Qué color preferís?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué frutas querés?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | escritorio: "Elegí "una" opción con comillas" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué color preferís?" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué frutas querés?" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "Elegí "una" opción con comillas" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-sin-repetidos/movil-pregunta.png) |  |
| `pregunta/sin-repetidos` | movil: "¿Qué color preferís?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "¿Qué frutas querés?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | movil: "Elegí "una" opción con comillas" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | movil: "¿Qué color preferís?" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "¿Qué frutas querés?" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "Elegí "una" opción con comillas" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
