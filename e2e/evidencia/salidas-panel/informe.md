# Evidencia E2E — salidas-panel

Fecha: 2026-10-06T12:01:57.572Z · Escenarios: 1 · Gobernador: rojo (pace 172% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 5 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `visual/salidas` | arrastrar el borde izquierdo agranda el panel de Salidas | ✅ pasa | [antes-de-arrastrar.png](visual-salidas/antes-de-arrastrar.png) [panel-agrandado.png](visual-salidas/panel-agrandado.png) | {"panelAntes":320,"panelDespues":620} |
| `visual/salidas` | arrastrar la manija entre lista y vista previa agranda la lista | ✅ pasa | [lista-agrandada.png](visual-salidas/lista-agrandada.png) | {"listaAntes":144,"listaDespues":264} |
| `visual/salidas` | los dos anchos sobreviven a recargar la página | ✅ pasa | [despues-de-recargar.png](visual-salidas/despues-de-recargar.png) | {"panelDespues":620,"panelRecarga":620,"listaDespues":264,"listaRecarga":264} |
| `visual/salidas` | "Pestaña nueva" abre la salida HTML renderizada en otra pestaña | ✅ pasa | [pestana-nueva.png](visual-salidas/pestana-nueva.png) | {"url":"blob:http://127.0.0.1:3902/4181349e-cde5","titulo":"Salida de prueba ewd6ov"} |
| `visual/salidas` | el HTML abierto en la pestaña nueva no puede leer el localStorage de la app | ✅ pasa | [pestana-nueva.png](visual-salidas/pestana-nueva.png) | {"origen":"BLOQUEADO","sandbox":"allow-scripts allow-popups"} |
