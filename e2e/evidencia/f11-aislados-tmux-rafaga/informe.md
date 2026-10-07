# Evidencia E2E — f11-aislados-tmux-rafaga

Fecha: 2026-10-07T13:16:39.869Z · Escenarios: 1 · Gobernador: verde (pace 78%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 4 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,1,1,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ✅ pasa | [final.png](tmux-rafaga/final.png) | {"enDom":[1,1,1,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["2165010"],"despues":["2165010"]} |
| `tmux/rafaga` | todos contestados | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[1,1,1,1,1]} |
