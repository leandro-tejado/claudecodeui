# Evidencia E2E — fase9-otra

Fecha: 2026-10-06T17:41:05.848Z · Escenarios: 1 · Gobernador: verde (pace 41%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 2 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `pregunta/otra` | la pregunta llega a la UI | ✅ pasa | [pregunta.png](pregunta-otra/pregunta.png) |  |
| `pregunta/otra` | el texto libre de "Otra" llega literal, sin romperse | ✅ pasa | [respondida.png](pregunta-otra/respondida.png) | {"linea":"Elegiste: Un \"verde azulado\", medio raro ¿no? \| Manzana \| Sí","esperado":"Un \"verde azulado\", medio raro ¿no?"} |
