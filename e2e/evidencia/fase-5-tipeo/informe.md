# Evidencia E2E — fase-5-tipeo

Fecha: 2026-10-06T12:46:13.146Z · Escenarios: 1 · Gobernador: rojo (pace 129% (>= 125%))

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 2 |
| ❌ falla | 2 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":23,"largos":"56,65,71,84,90,97,108,116,125,132,144,150,158,167,173,183,192,198,210,216,226,233,242,242,242"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":false} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":false,"msFin":4786} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
