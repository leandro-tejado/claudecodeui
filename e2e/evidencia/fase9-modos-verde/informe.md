# Evidencia E2E — fase9-modos-verde

Fecha: 2026-10-06T17:38:23.648Z · Escenarios: 1 · Gobernador: verde (pace 42%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 6 |
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
