# Evidencia E2E — f6-sin-arreglo

Fecha: 2026-10-06T14:20:15.796Z · Escenarios: 1 · Gobernador: rojo (pace 153% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 3 |
| ❌ falla | 1 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/subagente` | a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo) | ❌ falla | [a-mitad.png](headless-subagente/a-mitad.png) | {"vistoBash":false,"vistoRead":false,"cruzado":false} |
| `headless/subagente` | dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto | ✅ pasa | [paralelo.png](headless-subagente/paralelo.png) | {"tarjetaA":1,"tarjetaB":1,"vistoTextoA":true,"vistoTextoB":true} |
| `headless/subagente` | cada tarjeta se cierra con el resultado de su propio subagente | ✅ pasa | [final.png](headless-subagente/final.png) | {"resultadoA":1,"resultadoB":1} |
| `headless/subagente` | la respuesta principal no se parte ni se duplica con subagentes de por medio | ✅ pasa | [final.png](headless-subagente/final.png) | {"apariciones":1} |
