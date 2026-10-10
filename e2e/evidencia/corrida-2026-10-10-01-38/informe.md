# Evidencia E2E — corrida-2026-10-10-01-38

Fecha: 2026-10-10T01:39:03.394Z · Escenarios: 1 · Gobernador: verde (pace 69%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 6 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `vista/documentos` | claro: el compositor mide lo mismo que la columna de lectura | ✅ pasa | [frames-0.json](vista-documentos/frames-0.json) | {"columna":{"x":368,"y":105,"width":768,"height":416.78125},"compositor":{"x":384,"y":653,"width":736,"height":123,"top":653,"right":1120,"bottom":776,"left":384}} |
| `vista/documentos` | claro: la carpeta abierta del árbol usa el primario de marca | ✅ pasa | [arbol-claro.png](vista-documentos/arbol-claro.png) | {"colorCarpeta":"rgb(49, 86, 250)","primario":"rgb(49, 86, 250)"} |
| `vista/documentos` | claro: la cita del documento lleva el acento de marca y el fondo es la superficie | ✅ pasa | [documento-claro.png](vista-documentos/documento-claro.png) | {"estilos":{"borde":"rgb(49, 86, 250)","fondo":"rgb(255, 255, 255)"},"primario":"rgb(49, 86, 250)","superficie":"rgb(255, 255, 255)"} |
| `vista/documentos` | oscuro: el compositor mide lo mismo que la columna de lectura | ✅ pasa | [frames-0.json](vista-documentos/frames-0.json) | {"columna":{"x":368,"y":105,"width":768,"height":416.78125},"compositor":{"x":384,"y":653,"width":736,"height":123,"top":653,"right":1120,"bottom":776,"left":384}} |
| `vista/documentos` | oscuro: la carpeta abierta del árbol usa el primario de marca | ✅ pasa | [arbol-oscuro.png](vista-documentos/arbol-oscuro.png) | {"colorCarpeta":"rgb(124, 155, 255)","primario":"rgb(124, 155, 255)"} |
| `vista/documentos` | oscuro: la cita del documento lleva el acento de marca y el fondo es la superficie | ✅ pasa | [documento-oscuro.png](vista-documentos/documento-oscuro.png) | {"estilos":{"borde":"rgb(124, 155, 255)","fondo":"rgb(11, 18, 32)"},"primario":"rgb(124, 155, 255)","superficie":"rgb(11, 18, 32)"} |
