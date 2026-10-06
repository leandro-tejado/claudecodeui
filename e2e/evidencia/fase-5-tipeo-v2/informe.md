# Evidencia E2E — fase-5-tipeo-v2

Fecha: 2026-10-06T13:01:57.223Z · Escenarios: 1 · Gobernador: rojo (pace 147% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 4 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":24,"largos":"54,59,71,78,86,96,102,112,119,128,138,144,154,162,167,179,186,196,204,210,221,227,238,242,242"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":true} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":true,"msFin":4766} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
