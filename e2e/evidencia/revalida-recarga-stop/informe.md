# Evidencia E2E — revalida-recarga-stop

Fecha: 2026-10-06T17:16:56.226Z · Escenarios: 1 · Gobernador: verde (pace 53%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 3 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ✅ pasa | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | al terminar el turno el indicador se va | ✅ pasa | [al-terminar.png](headless-recarga/al-terminar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
