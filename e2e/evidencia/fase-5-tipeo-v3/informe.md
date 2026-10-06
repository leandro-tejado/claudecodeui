# Evidencia E2E — fase-5-tipeo-v3

Fecha: 2026-10-06T13:07:22.778Z · Escenarios: 1 · Gobernador: rojo (pace 151% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 4 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":24,"largos":"54,64,71,79,90,96,106,113,122,132,138,150,156,164,173,179,190,198,204,216,221,230,240,242,242"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":true} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":true,"msFin":4765} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
