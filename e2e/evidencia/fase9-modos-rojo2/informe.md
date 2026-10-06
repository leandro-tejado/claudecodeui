# Evidencia E2E — fase9-modos-rojo2

Fecha: 2026-10-06T17:36:50.765Z · Escenarios: 1 · Gobernador: verde (pace 43%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 2 |
| ❌ falla | 4 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `pregunta/modos` | default: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [default-pregunta.png](pregunta-modos/default-pregunta.png) |  |
| `pregunta/modos` | default: Claude repite exactamente lo elegido | ✅ pasa | [default-respondida.png](pregunta-modos/default-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | auto: la pregunta llega a la UI (no se contesta sola) | ❌ falla | [auto-pregunta.png](pregunta-modos/auto-pregunta.png) |  |
| `pregunta/modos` | auto: Claude repite exactamente lo elegido | ❌ falla | [frames-0.json](pregunta-modos/frames-0.json) | {"motivo":"la pregunta nunca llegó: no hay nada que elegir"} |
| `pregunta/modos` | bypassPermissions: la pregunta llega a la UI (no se contesta sola) | ❌ falla | [bypassPermissions-pregunta.png](pregunta-modos/bypassPermissions-pregunta.png) |  |
| `pregunta/modos` | bypassPermissions: Claude repite exactamente lo elegido | ❌ falla | [frames-0.json](pregunta-modos/frames-0.json) | {"motivo":"la pregunta nunca llegó: no hay nada que elegir"} |
