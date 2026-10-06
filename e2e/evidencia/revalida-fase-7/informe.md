# Evidencia E2E — revalida-fase-7

Actualizado: 2026-10-06T01:29:18.997Z · Gobernador: verde

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 11 |
| ❌ falla | 3 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `tmux/latencia` | la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL | ✅ pasa | [final.png](tmux-latencia/final.png) | {"jsonlMs":2691,"domMs":3413,"latenciaMs":722} |
| `tmux/en-vivo` | "pensando" visible ≤ 2 s después de enviar | ✅ pasa | [indicador.png](tmux-en-vivo/indicador.png) | {"tInd":746} |
| `tmux/en-vivo` | el texto crece en ≥ 3 muestras | ✅ pasa | [frames-0.json](tmux-en-vivo/frames-0.json) | {"distintas":4,"largos":"24,24,24,24,24,24,67,62,62,62,62,62,62,62,62,62,62,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949,949, |
| `tmux/en-vivo` | al final, una sola fila de respuesta | ✅ pasa | [final.png](tmux-en-vivo/final.png) | {"filas":1} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true} |
| `tmux/recarga` | tras recargar, el indicador sigue | ✅ pasa | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
| `tmux/commits` | 8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió | ✅ pasa | [enviado.png](tmux-commits/enviado.png) | {"enviadoMs":886} |
| `tmux/commits` | 62d63c69: con la sugerencia visible, el mensaje sale y se contesta | ✅ pasa | [final.png](tmux-commits/final.png) | {"sugerencia":"Respondé solo: mm7npu","finMs":1968,"respuestaVisible":true} |
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,0,0,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ❌ falla | [final.png](tmux-rafaga/final.png) | {"enDom":[1,0,0,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["520316"],"despues":["520316"]} |
| `tmux/rafaga` | todos contestados | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[1,0,0,1,1]} |
| `tmux/turno-corto` | cada turno pasa a libre ≤ 3 s después de que se ve la respuesta | ✅ pasa | [final.png](tmux-turno-corto/final.png) | [-34,-131,-35,-79,-26,-68,-53,-87,-79,-52] |
| `tmux/turno-corto` | cada respuesta aparece una vez | ✅ pasa | [frames-0.json](tmux-turno-corto/frames-0.json) | [1,1,1,1,1,1,1,1,1,1] |
