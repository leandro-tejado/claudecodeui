# Evidencia E2E — revalida-fase-9-falso

Fecha: 2026-10-06T19:03:28.073Z · Escenarios: 5 · Gobernador: verde (pace 68%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 33 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `pregunta/headless` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-headless/escritorio-pregunta.png) |  |
| `pregunta/headless` | escritorio: la pregunta pendiente se ve una sola vez | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":1} |
| `pregunta/headless` | escritorio: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | escritorio: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [escritorio-respondida.png](pregunta-headless/escritorio-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/headless` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-headless/movil-pregunta.png) |  |
| `pregunta/headless` | movil: la pregunta pendiente se ve una sola vez | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":1} |
| `pregunta/headless` | movil: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | movil: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [movil-respondida.png](pregunta-headless/movil-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/modos` | default: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [default-pregunta.png](pregunta-modos/default-pregunta.png) |  |
| `pregunta/modos` | default: Claude repite exactamente lo elegido | ✅ pasa | [default-respondida.png](pregunta-modos/default-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | auto: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [auto-pregunta.png](pregunta-modos/auto-pregunta.png) |  |
| `pregunta/modos` | auto: Claude repite exactamente lo elegido | ✅ pasa | [auto-respondida.png](pregunta-modos/auto-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | bypassPermissions: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [bypassPermissions-pregunta.png](pregunta-modos/bypassPermissions-pregunta.png) |  |
| `pregunta/modos` | bypassPermissions: Claude repite exactamente lo elegido | ✅ pasa | [bypassPermissions-respondida.png](pregunta-modos/bypassPermissions-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/otra` | la pregunta llega a la UI | ✅ pasa | [pregunta.png](pregunta-otra/pregunta.png) |  |
| `pregunta/otra` | el texto libre de "Otra" llega literal, sin romperse | ✅ pasa | [respondida.png](pregunta-otra/respondida.png) | {"linea":"Elegiste: Un \"verde azulado\", medio raro ¿no? \| Manzana \| Sí","esperado":"Un \"verde azulado\", medio raro ¿no?"} |
| `pregunta/recarga` | la pregunta llega a la UI | ✅ pasa | [pregunta.png](pregunta-recarga/pregunta.png) |  |
| `pregunta/recarga` | tras recargar, la pregunta con comillas aparece una sola vez y completa | ✅ pasa | [tras-recargar.png](pregunta-recarga/tras-recargar.png) | {"apariciones":1} |
| `pregunta/recarga` | tras recargar, se ve la respuesta elegida ("Sí") junto a esa pregunta | ✅ pasa | [tras-recargar-respuesta.png](pregunta-recarga/tras-recargar-respuesta.png) |  |
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
