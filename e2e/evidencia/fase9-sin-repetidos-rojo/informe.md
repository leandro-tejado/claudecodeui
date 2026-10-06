# Evidencia E2E — fase9-sin-repetidos-rojo

Fecha: 2026-10-06T17:44:04.411Z · Escenarios: 1 · Gobernador: verde (pace 39%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 12 |
| ❌ falla | 2 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `pregunta/sin-repetidos` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-sin-repetidos/escritorio-pregunta.png) |  |
| `pregunta/sin-repetidos` | escritorio: "¿Qué color preferís?" pendiente, una sola vez en el DOM | ❌ falla | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":2} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué frutas querés?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "Elegí "una" opción con comillas" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué color preferís?" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué frutas querés?" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "Elegí "una" opción con comillas" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-sin-repetidos/movil-pregunta.png) |  |
| `pregunta/sin-repetidos` | movil: "¿Qué color preferís?" pendiente, una sola vez en el DOM | ❌ falla | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":2} |
| `pregunta/sin-repetidos` | movil: "¿Qué frutas querés?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "Elegí "una" opción con comillas" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "¿Qué color preferís?" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "¿Qué frutas querés?" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "Elegí "una" opción con comillas" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
