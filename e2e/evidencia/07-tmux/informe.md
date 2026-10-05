# Evidencia E2E — 07-tmux

Actualizado: 2026-10-05T23:30:32.037Z · Gobernador: verde

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 10 |
| ❌ falla | 4 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `tmux/turno-corto` | cada turno pasa a libre ≤ 3 s después de que se ve la respuesta | ✅ pasa | [final.png](tmux-turno-corto/final.png) | [-136,-119,-91] |
| `tmux/turno-corto` | cada respuesta aparece una vez | ✅ pasa | [frames-0.json](tmux-turno-corto/frames-0.json) | [1,1,1] |
| `tmux/commits` | 8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió | ✅ pasa | [enviado.png](tmux-commits/enviado.png) | {"enviadoMs":894} |
| `tmux/commits` | 62d63c69: con la sugerencia visible, el mensaje sale y se contesta | ✅ pasa | [final.png](tmux-commits/final.png) | {"sugerencia":"Respondé solo: c0vgr0","finMs":2081,"respuestaVisible":true} |
| `tmux/latencia` | la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL | ✅ pasa | [final.png](tmux-latencia/final.png) | {"jsonlMs":4585,"domMs":4532,"latenciaMs":-53} |
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,0,0,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ❌ falla | [final.png](tmux-rafaga/final.png) | {"enDom":[1,0,0,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["489510","490175"],"despues":["489510","490175"]} |
| `tmux/rafaga` | todos contestados | ❌ falla | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[2,0,0,1,1]} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true} |
| `tmux/recarga` | tras recargar, el indicador sigue | ✅ pasa | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
| `tmux/en-vivo` | "pensando" visible ≤ 2 s después de enviar | ✅ pasa | [indicador.png](tmux-en-vivo/indicador.png) | {"tInd":732} |
| `tmux/en-vivo` | el texto crece en ≥ 3 muestras | ✅ pasa | [frames-0.json](tmux-en-vivo/frames-0.json) | {"distintas":9,"largos":"24,24,24,24,24,24,24,24,8,8,161,239,410,540,540,611,759,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832,832 |
| `tmux/en-vivo` | al final, una sola fila de respuesta | ✅ pasa | [final.png](tmux-en-vivo/final.png) | {"filas":1} |
