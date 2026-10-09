# Fase 1 — diagnóstico (9-oct-2026, instancia :3901)

Build medido: el del árbol de `~/cloudcli` al 9-oct (incluye `cfc92e61`). Solo sesiones `e2e-*`.

## 1. «Nueva sesión» falla a veces
- 10 intentos desde el compositor vacío (`vista/nueva-sesion`): **8 bien, 2 mal** (los intentos 9 y 10).
- Los dos fallos: el servidor respondió **409** al crear la sesión y la vista mostró «Failed to create session (409)».
- Causa (por el código, no medida en el instante): `sessions.service.ts:306` devuelve 409 `RAM_CEILING_EXCEEDED` cuando la RAM pasa el techo de **90 %** (`ram-ceiling.service.ts:8`). Cada sesión viva de la corrida deja un proceso `claude`; con 8 abiertas el VPS (7,8 GB) cruzó el techo. Justo después de la corrida la RAM estaba en 84 %.
- Defecto de cliente: `useChatComposerState.ts:1014` tira el error con solo el código y **descarta el mensaje del servidor**, que sí explicaba «RAM del servidor al N %…». Hay que mostrar ese texto. Va en la Fase 3, paso 7.
- Límite: el % exacto en el momento del 409 no quedó registrado. Falta anotarlo en el escenario.

## 2. La barra se actualiza sola
- `barra/sin-refresh`: 10 sesiones de tmux nuevas, la fila apareció **sin recargar en 556–899 ms** (10 de 10, tope 5 s).
- Veredicto: «Actualizar» se puede quitar. Queda el cuidado del plan: si se rompe el automático, se arregla el automático.

## 3. Streaming de tmux
- `tmux/en-vivo` en :3901: indicador «pensando» a 1178 ms, texto creciendo en **10 muestras distintas** (27 → 1001 caracteres), **una sola fila** al final. Veredicto: **en vivo** en :3901.
- No medido en :3001 (falta el login de Leandro en variable de entorno). Hipótesis sin verificar: lo que ve Leandro es un bundle sin construir/reiniciar tras `cfc92e61`. Se confirma con la corrida contra :3001 tras el rebuild.
