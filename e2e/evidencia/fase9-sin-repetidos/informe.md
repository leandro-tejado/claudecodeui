# Evidencia E2E — fase9-sin-repetidos

Fecha: 2026-10-06T17:42:20.052Z · Escenarios: 1 · Gobernador: verde (pace 40%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 14 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
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
