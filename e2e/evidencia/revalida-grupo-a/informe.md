# Evidencia E2E — revalida-grupo-a

Actualizado: 2026-10-05T22:02:03.117Z · Gobernador: verde

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 69 |
| ❌ falla | 5 |
| ⏸ bloqueado | 1 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `cuota/header` | 5 h muestra la lectura fresca del archivo (≤ 15 s, sin reiniciar) | ✅ pasa | [primera-lectura.png](cuota-header/primera-lectura.png) | {"ok":true,"ms":12,"ultima":"Ventana de 5 horas: 37% real, se renueva a las 02:55 AM · Semanal: 21% real, se renueva a las 11:55 PM"} |
| `cuota/header` | la semanal muestra % (no solo la hora de renovación) | ✅ pasa | [frames-0.json](cuota-header/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% real, se renueva a las 02:55 AM · Semanal: 21% real, se renueva a las 11:55 PM"} |
| `cuota/header` | el header sigue el cambio sin recargar (≤ 15 s) | ✅ pasa | [segunda-lectura.png](cuota-header/segunda-lectura.png) | {"ok":true,"ms":1544,"ultima":"Ventana de 5 horas: 52% real, se renueva a las 02:55 AM · Semanal: 23% real, se renueva a las 11:55 PM"} |
| `cuota/header` | el detalle no dice "sin dato" en ninguna ventana | ✅ pasa | [detalle.png](cuota-header/detalle.png) |  |
| `cuota/header` | movil: el header muestra la cuota | ✅ pasa | [movil-header.png](cuota-header/movil-header.png) | {"ok":true,"ms":5,"ultima":"Ventana de 5 horas: 52% real, se renueva a las 02:55 AM · Semanal: 23% real, se renueva a las 11:55 PM"} |
| `cuota/en-vivo` | el header abre con la primera lectura del archivo | ✅ pasa | [primera-lectura.png](cuota-en-vivo/primera-lectura.png) | {"ok":true,"ms":10,"ultima":"Ventana de 5 horas: 41% real, se renueva a las 02:55 AM · Semanal: 22% real, se renueva a las 11:55 PM"} |
| `cuota/en-vivo` | el header sigue el cambio del archivo en ≤ 3 s, sin recargar | ✅ pasa | [segunda-lectura.png](cuota-en-vivo/segunda-lectura.png) | {"ok":true,"ms":1426,"ultima":"Ventana de 5 horas: 52% real, se renueva a las 02:55 AM · Semanal: 23% real, se renueva a las 11:55 PM","msReales":1426} |
| `cuota/en-vivo` | la semanal también se actualizó (23%) | ✅ pasa | [frames-0.json](cuota-en-vivo/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 52% real, se renueva a las 02:55 AM · Semanal: 23% real, se renueva a las 11:55 PM"} |
| `cuota/en-vivo` | el label no dice "sin dato" habiendo archivo | ✅ pasa | [frames-0.json](cuota-en-vivo/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 52% real, se renueva a las 02:55 AM · Semanal: 23% real, se renueva a las 11:55 PM"} |
| `cuota/sin-turnos` | la ventana de 5 h muestra el % con su antigüedad ("hace N min"), no "sin dato" | ✅ pasa | [vieja-20min.png](cuota-sin-turnos/vieja-20min.png) | {"ok":true,"ms":11,"ultima":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 02:55 AM · Semanal: 21% hace 20 min, se renueva a las 11:55 PM"} |
| `cuota/sin-turnos` | la antigüedad reportada ronda los 20 min | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 02:55 AM · Semanal: 21% hace 20 min, se renueva a las 11:55 PM"} |
| `cuota/sin-turnos` | la semanal también muestra % con antigüedad, no "sin dato" | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 02:55 AM · Semanal: 21% hace 20 min, se renueva a las 11:55 PM"} |
| `cuota/sin-turnos` | no aparece "sin dato" en ningún lado habiendo una lectura (vieja) en el archivo | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 02:55 AM · Semanal: 21% hace 20 min, se renueva a las 11:55 PM"} |
| `cuota/vieja` | la ventana de 5 h muestra "ventana nueva" en vez de un % inventado | ✅ pasa | [reseteada.png](cuota-vieja/reseteada.png) | {"ok":true,"ms":11,"ultima":"Ventana de 5 horas: ventana nueva (se renovó a las 11:50 PM) · Semanal: 30% real, se renueva a las 11:55 PM"} |
| `cuota/vieja` | no muestra el 97% de la ventana ya cerrada | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 11:50 PM) · Semanal: 30% real, se renueva a las 11:55 PM"} |
| `cuota/vieja` | trae la hora en que se renovó | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 11:50 PM) · Semanal: 30% real, se renueva a las 11:55 PM"} |
| `cuota/vieja` | la semanal, que no pasó su reset, sigue mostrando su % real | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 11:50 PM) · Semanal: 30% real, se renueva a las 11:55 PM"} |
| `cuota/vieja` | no aparece "sin dato" en ningún lado (hay lectura para las dos ventanas) | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 11:50 PM) · Semanal: 30% real, se renueva a las 11:55 PM"} |
| `falso/humo` | llega `complete` en ≤ 10 s | ✅ pasa | [frames-0.json](falso-humo/frames-0.json) | {"ms":593} |
| `falso/humo` | la respuesta aparece exactamente una vez | ✅ pasa | [final.png](falso-humo/final.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [subagente-a-mitad-a-mitad.png](falso-intercalados/subagente-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [subagente-a-mitad-al-terminar.png](falso-intercalados/subagente-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | subagente-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [subagente-a-mitad-refrescado.png](falso-intercalados/subagente-a-mitad-refrescado.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [stderr-a-mitad-a-mitad.png](falso-intercalados/stderr-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [stderr-a-mitad-al-terminar.png](falso-intercalados/stderr-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | stderr-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [stderr-a-mitad-refrescado.png](falso-intercalados/stderr-a-mitad-refrescado.png) | {"filas":1} |
| `falso/6000-deltas` | sin `history_truncated` al reconectar | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) |  |
| `falso/6000-deltas` | el final del run ("6000") aparece exactamente una vez | ✅ pasa | [final.png](falso-6000-deltas/final.png) | {"finales":1,"msFin":3262} |
| `falso/6000-deltas` | el run entero está en una sola fila | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) | {"filas":1} |
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":19,"largos":"31,37,49,55,60,72,79,79,79,79,79,79,79,62,68,74,86,91,103,110,116,128,134,145,151"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":false} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ❌ falla | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":false,"msFin":4741} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ❌ falla | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":2593,"tResp":2892} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ✅ pasa | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
| `headless/subagente` | el texto del subagente se ve antes de que termine el turno | ✅ pasa | [subagente-en-vivo.png](headless-subagente/subagente-en-vivo.png) | {"tSub":1791,"fin":3264} |
| `headless/subagente` | hay una tarjeta del subagente con su descripción | ✅ pasa | [final.png](headless-subagente/final.png) | {"tarjeta":1} |
| `cola/headless` | el mensaje encolado se contesta | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"segundos":11} |
| `cola/headless` | cada mensaje del usuario aparece una vez | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"u2":1} |
| `cola/headless` | cada respuesta aparece una vez | ✅ pasa | [final.png](cola-headless/final.png) | {"r1":1,"r2":1} |
| `cola/headless` | el segundo mensaje se manda una sola vez por el WS | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"envios":0} |
| `pregunta/headless` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-headless/escritorio-pregunta.png) |  |
| `pregunta/headless` | escritorio: la pregunta pendiente se ve una sola vez | ❌ falla | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":2} |
| `pregunta/headless` | escritorio: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | escritorio: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [escritorio-respondida.png](pregunta-headless/escritorio-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/headless` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-headless/movil-pregunta.png) |  |
| `pregunta/headless` | movil: la pregunta pendiente se ve una sola vez | ❌ falla | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":2} |
| `pregunta/headless` | movil: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | movil: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [movil-respondida.png](pregunta-headless/movil-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `barra/archivar` | la sesión archivada sale de la barra ≤ 3 s sin recargar | ✅ pasa | [antes.png](barra-archivar/antes.png) [despues.png](barra-archivar/despues.png) | {"status":200,"antes":1,"tBajaMs":63,"trasRecargar":0} |
| `barra/componentes` | renombrar una sesión actualiza su fila en la barra en ≤ 3 s sin recargar | ✅ pasa | [antes-de-renombrar.png](barra-componentes/antes-de-renombrar.png) [despues-de-renombrar.png](barra-componentes/despues-de-renombrar.png) | {"status":200,"antes":1,"tCambioMs":48,"nuevoTitulo":"Renombrada en vivo lrxfop"} |
| `barra/pestana-oculta` | socket mudo ≥ 70 s (sin cerrarse): al volver, la barra refleja lo que pasó mientras estaba muda, sin recargar | ✅ pasa | [1-visible-antes-de-silenciar.png](barra-pestana-oculta/1-visible-antes-de-silenciar.png) [2-muda-recien-archivada.png](barra-pestana-oculta/2-muda-recien-archivada.png) [3-vuelta-al-dia.png](barra-pestana-oculta/3-vuelta-al-dia.png) | {"statusArchivar":200,"antes":1,"tBajaMs":5,"hayRefrescoDeCatchUp":true,"silencioMs":85000} |
| `visual/bocetos` | chat: movil/light sin scroll horizontal | ✅ pasa | [chat-movil-light.png](visual-bocetos/chat-movil-light.png) | {"desborde":0} |
| `visual/bocetos` | chat: movil/light consola sin errores | ✅ pasa | [chat-movil-light.png](visual-bocetos/chat-movil-light.png) | [] |
| `visual/bocetos` | chat: movil/dark sin scroll horizontal | ✅ pasa | [chat-movil-dark.png](visual-bocetos/chat-movil-dark.png) | {"desborde":0} |
| `visual/bocetos` | chat: movil/dark consola sin errores | ✅ pasa | [chat-movil-dark.png](visual-bocetos/chat-movil-dark.png) | [] |
| `visual/bocetos` | chat: escritorio/light sin scroll horizontal | ✅ pasa | [chat-escritorio-light.png](visual-bocetos/chat-escritorio-light.png) | {"desborde":0} |
| `visual/bocetos` | chat: escritorio/light consola sin errores | ✅ pasa | [chat-escritorio-light.png](visual-bocetos/chat-escritorio-light.png) | [] |
| `visual/bocetos` | chat: escritorio/dark sin scroll horizontal | ✅ pasa | [chat-escritorio-dark.png](visual-bocetos/chat-escritorio-dark.png) | {"desborde":0} |
| `visual/bocetos` | chat: escritorio/dark consola sin errores | ✅ pasa | [chat-escritorio-dark.png](visual-bocetos/chat-escritorio-dark.png) | [] |
| `visual/bocetos` | header-barra: movil/light sin scroll horizontal | ✅ pasa | [header-barra-movil-light.png](visual-bocetos/header-barra-movil-light.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: movil/light consola sin errores | ✅ pasa | [header-barra-movil-light.png](visual-bocetos/header-barra-movil-light.png) | [] |
| `visual/bocetos` | header-barra: movil/dark sin scroll horizontal | ✅ pasa | [header-barra-movil-dark.png](visual-bocetos/header-barra-movil-dark.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: movil/dark consola sin errores | ✅ pasa | [header-barra-movil-dark.png](visual-bocetos/header-barra-movil-dark.png) | [] |
| `visual/bocetos` | header-barra: escritorio/light sin scroll horizontal | ✅ pasa | [header-barra-escritorio-light.png](visual-bocetos/header-barra-escritorio-light.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: escritorio/light consola sin errores | ✅ pasa | [header-barra-escritorio-light.png](visual-bocetos/header-barra-escritorio-light.png) | [] |
| `visual/bocetos` | header-barra: escritorio/dark sin scroll horizontal | ✅ pasa | [header-barra-escritorio-dark.png](visual-bocetos/header-barra-escritorio-dark.png) | {"desborde":0} |
| `visual/bocetos` | header-barra: escritorio/dark consola sin errores | ✅ pasa | [header-barra-escritorio-dark.png](visual-bocetos/header-barra-escritorio-dark.png) | [] |
| `visual/bocetos` | cuestionario: boceto todavía no existe (paso 6 de la Fase 10, bloqueado por el ejemplo de Leandro) | ⏸ bloqueado | — | 05-octubre-cuestionario.html no existe todavía (Fase 10, paso 6: espera el prompt de ejemplo de Leandro) |
| `barra/orquestador` | orquestar.py crear aparece en la barra abierta en ≤ 3 s, 5 de 5 | ✅ pasa | [cinco-creaciones.png](barra-orquestador/cinco-creaciones.png) | {"exitos":5,"intentos":[{"intento":0,"nombre":"e2e-orq-0-ejecutora-1","sid":"5a6cc6b9-748e-4e24-ba3a-49d0defb14c0","tFilaMs":1613,"tBajaMs":321},{"intento":1,"nombre":"e2e-orq-1-ejecutora-1","sid":"3fa5c149-c532-4aa6-b44 |
| `barra/orquestador` | orquestar.py dormir cambia el estado en vivo (la fila sale de la barra sin recargar) | ✅ pasa | [antes-dormir.png](barra-orquestador/antes-dormir.png) [despues-dormir.png](barra-orquestador/despues-dormir.png) | {"antesDormir":21,"tBajaMs":317,"nombre":"e2e-orq-4-ejecutora-1","sid":"7fc460e3-78d6-41dc-b629-24bebf9852d5","dormidaOk":true} |
