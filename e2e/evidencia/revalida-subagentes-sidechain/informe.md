# Evidencia E2E — revalida-subagentes-sidechain

Fecha: 2026-10-06T17:54:09.465Z · Escenarios: 2 · Gobernador: verde (pace 71%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 11 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `falso/intercalados` | subagente-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [subagente-a-mitad-a-mitad.png](falso-intercalados/subagente-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [subagente-a-mitad-al-terminar.png](falso-intercalados/subagente-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | subagente-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [subagente-a-mitad-refrescado.png](falso-intercalados/subagente-a-mitad-refrescado.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [stderr-a-mitad-a-mitad.png](falso-intercalados/stderr-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [stderr-a-mitad-al-terminar.png](falso-intercalados/stderr-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | stderr-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [stderr-a-mitad-refrescado.png](falso-intercalados/stderr-a-mitad-refrescado.png) | {"filas":1} |
| `headless/subagente` | a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo) | ✅ pasa | [a-mitad.png](headless-subagente/a-mitad.png) | {"vistoBash":true,"vistoRead":true,"cruzado":false} |
| `headless/subagente` | dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto | ✅ pasa | [paralelo.png](headless-subagente/paralelo.png) | {"tarjetaA":1,"tarjetaB":1,"vistoTextoA":true,"vistoTextoB":true} |
| `headless/subagente` | cada tarjeta se cierra con el resultado de su propio subagente | ✅ pasa | [final.png](headless-subagente/final.png) | {"resultadoA":1,"resultadoB":1} |
| `headless/subagente` | el texto de cada subagente no se escapa al hilo principal | ✅ pasa | [final.png](headless-subagente/final.png) | {"sueltasA":0,"sueltasB":0} |
| `headless/subagente` | la respuesta principal no se parte ni se duplica con subagentes de por medio | ✅ pasa | [final.png](headless-subagente/final.png) | {"apariciones":1} |
