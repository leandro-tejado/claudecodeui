# Evidencia E2E — fase-11-tokens

Fecha: 2026-10-06T14:49:51.493Z · Escenarios: 1 · Gobernador: rojo (aviso nativo de cuota detectado en una sesion de tmux)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 2 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `falso/humo` | llega `complete` en ≤ 10 s | ✅ pasa | [frames-0.json](falso-humo/frames-0.json) | {"ms":604} |
| `falso/humo` | la respuesta aparece exactamente una vez | ✅ pasa | [final.png](falso-humo/final.png) | {"filas":1} |
