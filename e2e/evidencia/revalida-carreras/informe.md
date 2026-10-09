# Evidencia E2E — revalida-carreras

Actualizado: 2026-10-09T14:36:58.099Z · Gobernador: verde

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 7 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `barra/estado-vivo` | con el tmux vivo, la fila NO dice "dormida" | ✅ pasa | [tmux-vivo.png](barra-estado-vivo/tmux-vivo.png) | {"rotuloConVida":"libre"} |
| `barra/estado-vivo` | al matar el pane, la fila pasa a "dormida" sin recargar en ≤ 25000 ms | ✅ pasa | [antes-dormir.png](barra-estado-vivo/antes-dormir.png) [despues-dormir.png](barra-estado-vivo/despues-dormir.png) | {"msHastaDormida":947,"topeMs":25000,"dormidaOk":true,"nombre":"e2e-estado-ejecutora-1","sid":"ed361b61-2e25-4f54-b4d2-df181286a57c"} |
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ✅ pasa | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | al terminar el turno el indicador se va | ✅ pasa | [al-terminar.png](headless-recarga/al-terminar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true,"msHastaAck":null,"turnoCerradoAntesDeRecargar":false} |
| `tmux/recarga` | tras recargar, el indicador sigue | ✅ pasa | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
