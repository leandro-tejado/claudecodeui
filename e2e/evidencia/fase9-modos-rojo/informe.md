# Evidencia E2E — fase9-modos-rojo

Fecha: 2026-10-06T17:33:24.863Z · Escenarios: 1 · Gobernador: verde (pace 45%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 3 |
| ❌ falla | 1 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `pregunta/modos` | default: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [default-pregunta.png](pregunta-modos/default-pregunta.png) |  |
| `pregunta/modos` | default: Claude repite exactamente lo elegido | ✅ pasa | [default-respondida.png](pregunta-modos/default-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | auto: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [auto-pregunta.png](pregunta-modos/auto-pregunta.png) |  |
| `pregunta/modos` | el escenario corre sin excepción: locator.click: Timeout 30000ms exceeded. | ❌ falla | [error-0.png](pregunta-modos/error-0.png) | locator.click: Timeout 30000ms exceeded. \| Call log: \| [2m  - waiting for getByRole('button', { name: /^\s*\d*\s*Azul/ }).last()[22m \|  |
