# Evidencia E2E — subagentes-sidechain-sin-arreglo

Fecha: 2026-10-06T17:53:35.825Z · Escenarios: 1 · Gobernador: verde (pace 71%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 4 |
| ❌ falla | 1 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/subagente` | a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo) | ✅ pasa | [a-mitad.png](headless-subagente/a-mitad.png) | {"vistoBash":true,"vistoRead":true,"cruzado":false} |
| `headless/subagente` | dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto | ✅ pasa | [paralelo.png](headless-subagente/paralelo.png) | {"tarjetaA":1,"tarjetaB":1,"vistoTextoA":true,"vistoTextoB":true} |
| `headless/subagente` | cada tarjeta se cierra con el resultado de su propio subagente | ✅ pasa | [final.png](headless-subagente/final.png) | {"resultadoA":1,"resultadoB":1} |
| `headless/subagente` | el texto de cada subagente no se escapa al hilo principal | ❌ falla | [final.png](headless-subagente/final.png) | {"sueltasA":1,"sueltasB":1} |
| `headless/subagente` | la respuesta principal no se parte ni se duplica con subagentes de por medio | ✅ pasa | [final.png](headless-subagente/final.png) | {"apariciones":1} |
