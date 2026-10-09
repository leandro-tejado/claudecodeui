# Evidencia E2E — revalida-carreras

Fecha: 2026-10-09T14:04:18.054Z · Escenarios: 2 · Gobernador: verde (pace 5%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 4 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `barra/estado-vivo` | con el tmux vivo, la fila NO dice "dormida" | ✅ pasa | [tmux-vivo.png](barra-estado-vivo/tmux-vivo.png) | {"rotuloConVida":"libre"} |
| `barra/estado-vivo` | al matar el pane, la fila pasa a "dormida" sin recargar en ≤ 25000 ms | ✅ pasa | [antes-dormir.png](barra-estado-vivo/antes-dormir.png) [despues-dormir.png](barra-estado-vivo/despues-dormir.png) | {"msHastaDormida":947,"topeMs":25000,"dormidaOk":true,"nombre":"e2e-estado-ejecutora-1","sid":"ed361b61-2e25-4f54-b4d2-df181286a57c"} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true,"msHastaAck":null,"turnoCerradoAntesDeRecargar":false} |
| `tmux/recarga` | tras recargar, el indicador sigue | ✅ pasa | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
