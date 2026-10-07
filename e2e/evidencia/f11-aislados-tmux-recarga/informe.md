# Evidencia E2E — f11-aislados-tmux-recarga

Fecha: 2026-10-07T13:16:55.520Z · Escenarios: 1 · Gobernador: verde (pace 84%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 2 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true} |
| `tmux/recarga` | tras recargar, el indicador sigue | ✅ pasa | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
