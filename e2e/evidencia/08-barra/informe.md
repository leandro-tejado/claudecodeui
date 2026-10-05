# Evidencia E2E — 08-barra

Actualizado: 2026-10-05T21:39:29.904Z · Gobernador: rojo

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 3 |
| ❌ falla | 0 |
| ⏸ bloqueado | 2 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `barra/orquestador` | orquestar.py crear aparece en la barra abierta en ≤ 3 s, 5 de 5 | ⏸ bloqueado | — | gobernador en rojo (cuota pelada: 99% consumido (>= 98%)) |
| `barra/orquestador` | orquestar.py dormir cambia el estado en vivo (la fila sale de la barra sin recargar) | ⏸ bloqueado | — | gobernador en rojo (cuota pelada: 99% consumido (>= 98%)) |
| `barra/archivar` | la sesión archivada sale de la barra ≤ 3 s sin recargar | ✅ pasa | [antes.png](barra-archivar/antes.png) [despues.png](barra-archivar/despues.png) | {"status":200,"antes":1,"tBajaMs":36,"trasRecargar":0} |
| `barra/componentes` | renombrar una sesión actualiza su fila en la barra en ≤ 3 s sin recargar | ✅ pasa | [antes-de-renombrar.png](barra-componentes/antes-de-renombrar.png) [despues-de-renombrar.png](barra-componentes/despues-de-renombrar.png) | {"status":200,"antes":1,"tCambioMs":38,"nuevoTitulo":"Renombrada en vivo 5o0rr5"} |
| `barra/pestana-oculta` | socket mudo ≥ 70 s (sin cerrarse): al volver, la barra refleja lo que pasó mientras estaba muda, sin recargar | ✅ pasa | [1-visible-antes-de-silenciar.png](barra-pestana-oculta/1-visible-antes-de-silenciar.png) [2-muda-recien-archivada.png](barra-pestana-oculta/2-muda-recien-archivada.png) [3-vuelta-al-dia.png](barra-pestana-oculta/3-vuelta-al-dia.png) | {"statusArchivar":200,"antes":1,"tBajaMs":10,"hayRefrescoDeCatchUp":true,"silencioMs":85000} |
