# Evidencia E2E — final-3901

Actualizado: 2026-10-08T20:03:46.144Z · Gobernador: verde

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 214 |
| ❌ falla | 0 |
| ⏸ bloqueado | 2 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `barra/archivar` | la sesión archivada sale de la barra ≤ 3 s sin recargar | ✅ pasa | [antes.png](barra-archivar/antes.png) [despues.png](barra-archivar/despues.png) | {"status":200,"antes":1,"tBajaMs":48,"trasRecargar":0} |
| `barra/componentes` | renombrar una sesión actualiza su fila en la barra en ≤ 3 s sin recargar | ✅ pasa | [antes-de-renombrar.png](barra-componentes/antes-de-renombrar.png) [despues-de-renombrar.png](barra-componentes/despues-de-renombrar.png) | {"status":200,"antes":1,"tCambioMs":61,"nuevoTitulo":"Renombrada en vivo 28r0j3"} |
| `barra/estado-vivo` | con el tmux vivo, la fila NO dice "dormida" | ✅ pasa | [tmux-vivo.png](barra-estado-vivo/tmux-vivo.png) | {"rotuloConVida":"libre"} |
| `barra/estado-vivo` | al matar el pane, la fila pasa a "dormida" sin recargar en ≤ 25000 ms | ✅ pasa | [antes-dormir.png](barra-estado-vivo/antes-dormir.png) [despues-dormir.png](barra-estado-vivo/despues-dormir.png) | {"msHastaDormida":3190,"topeMs":25000,"dormidaOk":true,"nombre":"e2e-estado-ejecutora-1","sid":"90120706-c575-41db-8383-5d9e908e4eed"} |
| `barra/nombres` | la fila de la barra muestra el título humano, no el prompt crudo ni un id | ✅ pasa | [barra-prosa.png](barra-nombres/barra-prosa.png) | {"tituloProsa":"Explicame en una frase qué es un psicrómetro","derivado":"Explicame en una frase qué es un psicrómetro","aiTitles":["Psicrómetro"],"mensaje":"Explicame en una frase qué es un psicrómetro."} |
| `barra/nombres` | tmux show-options -v @titulo devuelve ese mismo título | ✅ pasa | [frames-0.json](barra-nombres/frames-0.json) | {"tituloTmuxProsa":"Explicame en una frase qué es un psicrómetro","enLaBarra":"Explicame en una frase qué es un psicrómetro","nombre":"e2e-nombre-prosa-ejecutora-1"} |
| `barra/nombres` | un mensaje en modo bash (<bash-input>) no deja un título crudo con etiquetas en la barra | ✅ pasa | [barra-bash.png](barra-nombres/barra-bash.png) | {"tituloBash":"Comando: echo hola-jlqibo","esperado":"Comando: echo hola-jlqibo","sinEtiquetasCrudas":true} |
| `barra/nombres` | tmux show-options -v @titulo del modo bash tampoco queda crudo | ✅ pasa | [frames-0.json](barra-nombres/frames-0.json) | {"tituloTmuxBash":"Comando: echo hola-jlqibo","esperado":"Comando: echo hola-jlqibo","nombre":"e2e-nombre-bash-ejecutora-1"} |
| `barra/pestana-oculta` | socket mudo ≥ 70 s (sin cerrarse): al volver, la barra refleja lo que pasó mientras estaba muda, sin recargar | ✅ pasa | [1-visible-antes-de-silenciar.png](barra-pestana-oculta/1-visible-antes-de-silenciar.png) [2-muda-recien-archivada.png](barra-pestana-oculta/2-muda-recien-archivada.png) [3-vuelta-al-dia.png](barra-pestana-oculta/3-vuelta-al-dia.png) | {"statusArchivar":200,"antes":1,"tBajaMs":6,"hayRefrescoDeCatchUp":true,"silencioMs":85000} |
| `cola/headless` | el mensaje encolado se contesta | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"segundos":13} |
| `cola/headless` | cada mensaje del usuario aparece una vez | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"u2":1} |
| `cola/headless` | cada respuesta aparece una vez | ✅ pasa | [final.png](cola-headless/final.png) | {"r1":1,"r2":1} |
| `cola/headless` | el segundo mensaje se manda una sola vez por el WS | ✅ pasa | [frames-0.json](cola-headless/frames-0.json) | {"envios":0} |
| `cuota/en-vivo` | el header abre con la primera lectura del archivo | ✅ pasa | [primera-lectura.png](cuota-en-vivo/primera-lectura.png) | {"ok":true,"ms":7,"ultima":"Cuenta Optimum · Ventana de 5 horas: 41% real, se renueva a las 12:44 AM · Semanal: 22% real, se renueva a las 09:44 PM"} |
| `cuota/en-vivo` | el header sigue el cambio del archivo en ≤ 3 s, sin recargar | ✅ pasa | [segunda-lectura.png](cuota-en-vivo/segunda-lectura.png) | {"ok":true,"ms":1428,"ultima":"Cuenta Optimum · Ventana de 5 horas: 52% real, se renueva a las 12:44 AM · Semanal: 23% real, se renueva a las 09:44 PM","msReales":1428} |
| `cuota/en-vivo` | la semanal también se actualizó (23%) | ✅ pasa | [frames-0.json](cuota-en-vivo/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 52% real, se renueva a las 12:44 AM · Semanal: 23% real, se renueva a las 09:44 PM"} |
| `cuota/en-vivo` | el label no dice "sin dato" habiendo archivo | ✅ pasa | [frames-0.json](cuota-en-vivo/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 52% real, se renueva a las 12:44 AM · Semanal: 23% real, se renueva a las 09:44 PM"} |
| `cuota/header` | 5 h muestra la lectura fresca del archivo (≤ 15 s, sin reiniciar) | ✅ pasa | [primera-lectura.png](cuota-header/primera-lectura.png) | {"ok":true,"ms":4,"ultima":"Cuenta Optimum · Ventana de 5 horas: 37% real, se renueva a las 12:44 AM · Semanal: 21% real, se renueva a las 09:44 PM"} |
| `cuota/header` | la semanal muestra % (no solo la hora de renovación) | ✅ pasa | [frames-0.json](cuota-header/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% real, se renueva a las 12:44 AM · Semanal: 21% real, se renueva a las 09:44 PM"} |
| `cuota/header` | el header sigue el cambio sin recargar (≤ 15 s) | ✅ pasa | [segunda-lectura.png](cuota-header/segunda-lectura.png) | {"ok":true,"ms":517,"ultima":"Cuenta Optimum · Ventana de 5 horas: 52% real, se renueva a las 12:44 AM · Semanal: 23% real, se renueva a las 09:44 PM"} |
| `cuota/header` | el detalle no dice "sin dato" en ninguna ventana | ✅ pasa | [detalle.png](cuota-header/detalle.png) |  |
| `cuota/header` | movil: el header muestra la cuota | ✅ pasa | [movil-header.png](cuota-header/movil-header.png) | {"ok":true,"ms":6,"ultima":"Cuenta Optimum · Ventana de 5 horas: 52% real, se renueva a las 12:44 AM · Semanal: 23% real, se renueva a las 09:44 PM"} |
| `cuota/sin-turnos` | la ventana de 5 h muestra el % con su antigüedad ("hace N min"), no "sin dato" | ✅ pasa | [vieja-20min.png](cuota-sin-turnos/vieja-20min.png) | {"ok":true,"ms":6,"ultima":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 12:44 AM · Semanal: 21% hace 20 min, se renueva a las 09:44 PM"} |
| `cuota/sin-turnos` | la antigüedad reportada ronda los 20 min | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 12:44 AM · Semanal: 21% hace 20 min, se renueva a las 09:44 PM"} |
| `cuota/sin-turnos` | la semanal también muestra % con antigüedad, no "sin dato" | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 12:44 AM · Semanal: 21% hace 20 min, se renueva a las 09:44 PM"} |
| `cuota/sin-turnos` | no aparece "sin dato" en ningún lado habiendo una lectura (vieja) en el archivo | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 12:44 AM · Semanal: 21% hace 20 min, se renueva a las 09:44 PM"} |
| `cuota/vieja` | la ventana de 5 h muestra "ventana nueva" en vez de un % inventado | ✅ pasa | [reseteada.png](cuota-vieja/reseteada.png) | {"ok":true,"ms":6,"ultima":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 09:39 PM) · Semanal: 30% real, se renueva a las 09:44 PM"} |
| `cuota/vieja` | no muestra el 97% de la ventana ya cerrada | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 09:39 PM) · Semanal: 30% real, se renueva a las 09:44 PM"} |
| `cuota/vieja` | trae la hora en que se renovó | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 09:39 PM) · Semanal: 30% real, se renueva a las 09:44 PM"} |
| `cuota/vieja` | la semanal, que no pasó su reset, sigue mostrando su % real | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 09:39 PM) · Semanal: 30% real, se renueva a las 09:44 PM"} |
| `cuota/vieja` | no aparece "sin dato" en ningún lado (hay lectura para las dos ventanas) | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 09:39 PM) · Semanal: 30% real, se renueva a las 09:44 PM"} |
| `diseno/capturas` | light/movil: sin scroll horizontal | ✅ pasa | [light-movil-a-mitad.png](diseno-capturas/light-movil-a-mitad.png) [light-movil-final.png](diseno-capturas/light-movil-final.png) | {"desborde":0} |
| `diseno/capturas` | light/movil: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `diseno/capturas` | light/escritorio: sin scroll horizontal | ✅ pasa | [light-escritorio-a-mitad.png](diseno-capturas/light-escritorio-a-mitad.png) [light-escritorio-final.png](diseno-capturas/light-escritorio-final.png) | {"desborde":0} |
| `diseno/capturas` | light/escritorio: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `diseno/capturas` | dark/movil: sin scroll horizontal | ✅ pasa | [dark-movil-a-mitad.png](diseno-capturas/dark-movil-a-mitad.png) [dark-movil-final.png](diseno-capturas/dark-movil-final.png) | {"desborde":0} |
| `diseno/capturas` | dark/movil: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `diseno/capturas` | dark/escritorio: sin scroll horizontal | ✅ pasa | [dark-escritorio-a-mitad.png](diseno-capturas/dark-escritorio-a-mitad.png) [dark-escritorio-final.png](diseno-capturas/dark-escritorio-final.png) | {"desborde":0} |
| `diseno/capturas` | dark/escritorio: consola sin errores | ✅ pasa | [frames-0.json](diseno-capturas/frames-0.json) | [] |
| `falso/6000-deltas` | sin `history_truncated` al reconectar | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) |  |
| `falso/6000-deltas` | el final del run ("6000") aparece exactamente una vez | ✅ pasa | [final.png](falso-6000-deltas/final.png) | {"finales":1,"msFin":null} |
| `falso/6000-deltas` | el run entero está en una sola fila | ✅ pasa | [frames-0.json](falso-6000-deltas/frames-0.json) | {"filas":1} |
| `falso/humo` | llega `complete` en ≤ 10 s | ✅ pasa | [frames-0.json](falso-humo/frames-0.json) | {"ms":750} |
| `falso/humo` | la respuesta aparece exactamente una vez | ✅ pasa | [final.png](falso-humo/final.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [subagente-a-mitad-a-mitad.png](falso-intercalados/subagente-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | subagente-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [subagente-a-mitad-al-terminar.png](falso-intercalados/subagente-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | subagente-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [subagente-a-mitad-refrescado.png](falso-intercalados/subagente-a-mitad-refrescado.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: a mitad, el texto principal está en una sola fila | ✅ pasa | [stderr-a-mitad-a-mitad.png](falso-intercalados/stderr-a-mitad-a-mitad.png) | {"filas":1} |
| `falso/intercalados` | stderr-a-mitad: al terminar, una fila con el texto completo y ningún fragmento suelto | ✅ pasa | [stderr-a-mitad-al-terminar.png](falso-intercalados/stderr-a-mitad-al-terminar.png) | {"completas":1,"conElComienzo":1} |
| `falso/intercalados` | stderr-a-mitad: tras refrescar el historial sigue en una fila | ✅ pasa | [stderr-a-mitad-refrescado.png](falso-intercalados/stderr-a-mitad-refrescado.png) | {"filas":1} |
| `headless/actividad` | hay un indicador de actividad visible antes del primer token | ✅ pasa | [antes-del-primer-token.png](headless-actividad/antes-del-primer-token.png) | {"indicador":["Thinking…\n0s\nStop\nesc","Thinking…\n0s","Stop\nesc"]} |
| `headless/actividad` | el razonamiento se ve mientras se genera (≤ 2,3 s) | ✅ pasa | [razonamiento-en-vivo.png](headless-actividad/razonamiento-en-vivo.png) | {"tRazon":1963,"tResp":2869} |
| `headless/actividad` | el server reenvía deltas de pensamiento | ✅ pasa | [frames-0.json](headless-actividad/frames-0.json) | {"deltas":11} |
| `headless/actividad` | la respuesta final aparece una vez | ✅ pasa | [final.png](headless-actividad/final.png) |  |
| `headless/actividad` | (herramienta) el indicador está visible antes del primer token | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | el indicador muestra el nombre de la tool mientras corre | ✅ pasa | [herramienta-durante-la-tool.png](headless-actividad/herramienta-durante-la-tool.png) | {"textoDuranteTool":"Bash…\n0s"} |
| `headless/actividad` | tras ≥800 ms sin texto nuevo, el indicador vuelve a verse ("Thinking…") | ✅ pasa | [herramienta-reaparece-tras-hueco.png](headless-actividad/herramienta-reaparece-tras-hueco.png) | {"tReaparece":856} |
| `headless/actividad` | (herramienta) la respuesta final aparece una vez | ✅ pasa | [herramienta-final.png](headless-actividad/herramienta-final.png) |  |
| `headless/pensamiento` | llegan deltas de pensamiento con texto | ⏸ bloqueado | — | la instancia de prueba no tiene CLAUDE_CODE_OAUTH_TOKEN (decisión de Leandro) |
| `headless/pensamiento` | el razonamiento se ve antes de la respuesta | ⏸ bloqueado | — | la instancia de prueba no tiene CLAUDE_CODE_OAUTH_TOKEN (decisión de Leandro) |
| `headless/recarga` | tras recargar a mitad, el indicador de actividad sigue | ✅ pasa | [tras-recargar.png](headless-recarga/tras-recargar.png) |  |
| `headless/recarga` | al terminar el turno el indicador se va | ✅ pasa | [al-terminar.png](headless-recarga/al-terminar.png) |  |
| `headless/recarga` | una sola fila completa y sin fragmentos | ✅ pasa | [final.png](headless-recarga/final.png) | {"completas":1,"conElComienzo":1} |
| `headless/subagente` | a mitad del subagente, su tarjeta muestra la tool en curso (antes del mensaje completo) | ✅ pasa | [a-mitad.png](headless-subagente/a-mitad.png) | {"vistoBash":true,"vistoRead":true,"cruzado":false} |
| `headless/subagente` | dos subagentes en paralelo: una tarjeta por cada uno, cada una con su propio texto | ✅ pasa | [paralelo.png](headless-subagente/paralelo.png) | {"tarjetaA":1,"tarjetaB":1,"vistoTextoA":true,"vistoTextoB":true} |
| `headless/subagente` | cada tarjeta se cierra con el resultado de su propio subagente | ✅ pasa | [final.png](headless-subagente/final.png) | {"resultadoA":1,"resultadoB":1} |
| `headless/subagente` | el texto de cada subagente no se escapa al hilo principal | ✅ pasa | [final.png](headless-subagente/final.png) | {"sueltasA":0,"sueltasB":0} |
| `headless/subagente` | la respuesta principal no se parte ni se duplica con subagentes de por medio | ✅ pasa | [final.png](headless-subagente/final.png) | {"apariciones":1} |
| `headless/tipeo` | el texto visible crece en ≥ 5 muestras distintas | ✅ pasa | [a-mitad.png](headless-tipeo/a-mitad.png) | {"distintas":25,"largos":"24,31,42,48,58,65,73,84,90,100,107,113,126,132,144,150,161,170,180,186,198,204,215,221,234"} |
| `headless/tipeo` | la fila en streaming no se remonta mientras se escribe | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoDuranteStream":true} |
| `headless/tipeo` | al terminar sigue siendo el mismo nodo (el final no pinta otra fila) | ✅ pasa | [frames-0.json](headless-tipeo/frames-0.json) | {"mismoAlFinal":true,"msFin":4775} |
| `headless/tipeo` | una sola fila con la respuesta | ✅ pasa | [final.png](headless-tipeo/final.png) | {"filas":1} |
| `linea-base/4158e887` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](linea-base-4158e887/simple-pregunta.png) |  |
| `linea-base/4158e887` | simple: llega la elegida | ✅ pasa | [frames-0.json](linea-base-4158e887/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `linea-base/4158e887` | múltiple: llegan las 3 tildadas | ✅ pasa | [multi-pregunta.png](linea-base-4158e887/multi-pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nCuota: 7d en 77% con 59% de la semana transcurrida; proyecta 130% al reset en 68 h, así que co"} |
| `linea-base/4158e887` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](linea-base-4158e887/final.png) | {"pregunta":1} |
| `pregunta/headless` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-headless/escritorio-pregunta.png) |  |
| `pregunta/headless` | escritorio: la pregunta pendiente se ve una sola vez | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":1} |
| `pregunta/headless` | escritorio: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | escritorio: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [escritorio-respondida.png](pregunta-headless/escritorio-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/headless` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-headless/movil-pregunta.png) |  |
| `pregunta/headless` | movil: la pregunta pendiente se ve una sola vez | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"apariciones":1} |
| `pregunta/headless` | movil: Claude recibe exactamente lo elegido | ✅ pasa | [frames-0.json](pregunta-headless/frames-0.json) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/headless` | movil: después de contestar, la pregunta y la respuesta aparecen una vez cada una | ✅ pasa | [movil-respondida.png](pregunta-headless/movil-respondida.png) | {"pregunta":1,"respuesta":1,"filasEco":1} |
| `pregunta/modos` | default: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [default-pregunta.png](pregunta-modos/default-pregunta.png) |  |
| `pregunta/modos` | default: Claude repite exactamente lo elegido | ✅ pasa | [default-respondida.png](pregunta-modos/default-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | auto: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [auto-pregunta.png](pregunta-modos/auto-pregunta.png) |  |
| `pregunta/modos` | auto: Claude repite exactamente lo elegido | ✅ pasa | [auto-respondida.png](pregunta-modos/auto-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/modos` | bypassPermissions: la pregunta llega a la UI (no se contesta sola) | ✅ pasa | [bypassPermissions-pregunta.png](pregunta-modos/bypassPermissions-pregunta.png) |  |
| `pregunta/modos` | bypassPermissions: Claude repite exactamente lo elegido | ✅ pasa | [bypassPermissions-respondida.png](pregunta-modos/bypassPermissions-respondida.png) | {"linea":"Elegiste: Azul \| Manzana, Uva \| Sí"} |
| `pregunta/otra` | la pregunta llega a la UI | ✅ pasa | [pregunta.png](pregunta-otra/pregunta.png) |  |
| `pregunta/otra` | el texto libre de "Otra" llega literal, sin romperse | ✅ pasa | [respondida.png](pregunta-otra/respondida.png) | {"linea":"Elegiste: Un \"verde azulado\", medio raro ¿no? \| Manzana \| Sí","esperado":"Un \"verde azulado\", medio raro ¿no?"} |
| `pregunta/recarga` | la pregunta llega a la UI | ✅ pasa | [pregunta.png](pregunta-recarga/pregunta.png) |  |
| `pregunta/recarga` | tras recargar, la pregunta con comillas aparece una sola vez y completa | ✅ pasa | [tras-recargar.png](pregunta-recarga/tras-recargar.png) | {"apariciones":1} |
| `pregunta/recarga` | tras recargar, se ve la respuesta elegida ("Sí") junto a esa pregunta | ✅ pasa | [tras-recargar-respuesta.png](pregunta-recarga/tras-recargar-respuesta.png) |  |
| `pregunta/sin-repetidos` | escritorio: la pregunta llega a la UI | ✅ pasa | [escritorio-pregunta.png](pregunta-sin-repetidos/escritorio-pregunta.png) |  |
| `pregunta/sin-repetidos` | escritorio: "¿Qué color preferís?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué frutas querés?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | escritorio: "Elegí "una" opción con comillas" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué color preferís?" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "¿Qué frutas querés?" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | escritorio: "Elegí "una" opción con comillas" contestada, una sola vez en el DOM | ✅ pasa | [escritorio-respondida.png](pregunta-sin-repetidos/escritorio-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: la pregunta llega a la UI | ✅ pasa | [movil-pregunta.png](pregunta-sin-repetidos/movil-pregunta.png) |  |
| `pregunta/sin-repetidos` | movil: "¿Qué color preferís?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "¿Qué frutas querés?" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | movil: "Elegí "una" opción con comillas" pendiente, una sola vez en el DOM | ✅ pasa | [frames-0.json](pregunta-sin-repetidos/frames-0.json) | {"apariciones":0} |
| `pregunta/sin-repetidos` | movil: "¿Qué color preferís?" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "¿Qué frutas querés?" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/sin-repetidos` | movil: "Elegí "una" opción con comillas" contestada, una sola vez en el DOM | ✅ pasa | [movil-respondida.png](pregunta-sin-repetidos/movil-respondida.png) | {"apariciones":1} |
| `pregunta/tmux-multi` | llegan las 3 tildadas | ✅ pasa | [pregunta.png](pregunta-tmux-multi/pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\nMD"} |
| `pregunta/tmux-multi` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](pregunta-tmux-multi/final.png) | {"pregunta":1} |
| `pregunta/tmux-simple` | la pregunta llega a la tarjeta | ✅ pasa | [pregunta.png](pregunta-tmux-simple/pregunta.png) |  |
| `pregunta/tmux-simple` | llega la elegida | ✅ pasa | [final.png](pregunta-tmux-simple/final.png) | {"ultima":"ELEGISTE Pera\nMD"} |
| `pregunta/tmux` | simple: la pregunta llega a la tarjeta | ✅ pasa | [simple-pregunta.png](pregunta-tmux/simple-pregunta.png) |  |
| `pregunta/tmux` | simple: llega la elegida | ✅ pasa | [frames-0.json](pregunta-tmux/frames-0.json) | {"ultima":"ELEGISTE Pera\nMD"} |
| `pregunta/tmux` | múltiple: llegan las 3 tildadas | ✅ pasa | [multi-pregunta.png](pregunta-tmux/multi-pregunta.png) | {"ultima":"COLORES Rojo, Azul, Negro\n[cuota] 7d en 77% con 59% de la semana transcurrida: proyecta 130% al reset, en 68 h. Conviene"} |
| `pregunta/tmux` | la pregunta y la respuesta se ven una vez | ✅ pasa | [final.png](pregunta-tmux/final.png) | {"pregunta":1} |
| `tmux/adjunto` | el mensaje del usuario aparece una vez en el DOM (una imagen) | ✅ pasa | [dom-1.png](tmux-adjunto/dom-1.png) | {"filasUser":1} |
| `tmux/adjunto` | no aparece el error de "no apareció" en el DOM (una imagen) | ✅ pasa | [dom-1.png](tmux-adjunto/dom-1.png) | {"filasError":0} |
| `tmux/adjunto` | el JSONL tiene la fila user con el nonce y un bloque de imagen (una imagen) | ✅ pasa | [frames-0.json](tmux-adjunto/frames-0.json) | {"filaUser":true,"tieneBloqueImagen":true} |
| `tmux/adjunto` | Claude contesta (una imagen) | ✅ pasa | [respuesta-1.png](tmux-adjunto/respuesta-1.png) | {"finMs":6047} |
| `tmux/adjunto` | el mensaje del usuario aparece una vez en el DOM (dos imágenes) | ✅ pasa | [dom-2.png](tmux-adjunto/dom-2.png) | {"filasUser":1} |
| `tmux/adjunto` | no aparece el error de "no apareció" en el DOM (dos imágenes) | ✅ pasa | [dom-2.png](tmux-adjunto/dom-2.png) | {"filasError":0} |
| `tmux/adjunto` | el JSONL tiene la fila user con el nonce y un bloque de imagen (dos imágenes) | ✅ pasa | [frames-0.json](tmux-adjunto/frames-0.json) | {"filaUser":true,"tieneBloqueImagen":true} |
| `tmux/adjunto` | Claude contesta (dos imágenes) | ✅ pasa | [respuesta-2.png](tmux-adjunto/respuesta-2.png) | {"finMs":9430} |
| `tmux/commits` | 8267cbe1: el mensaje muestra "Enviado" una vez que el pane lo recibió | ✅ pasa | [enviado.png](tmux-commits/enviado.png) | {"enviadoMs":848} |
| `tmux/commits` | 62d63c69: con la sugerencia visible, el mensaje sale y se contesta | ✅ pasa | [final.png](tmux-commits/final.png) | {"sugerencia":"Respondé solo: padw32","finMs":2377,"respuestaVisible":true} |
| `tmux/en-vivo` | "pensando" visible ≤ 2 s después de enviar | ✅ pasa | [indicador.png](tmux-en-vivo/indicador.png) | {"tInd":724} |
| `tmux/en-vivo` | el texto crece en ≥ 3 muestras | ✅ pasa | [frames-0.json](tmux-en-vivo/frames-0.json) | {"distintas":10,"largos":"27,27,27,27,27,27,27,89,249,335,460,574,695,822,891,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,907,90 |
| `tmux/en-vivo` | al final, una sola fila de respuesta | ✅ pasa | [final.png](tmux-en-vivo/final.png) | {"filas":1} |
| `tmux/latencia` | la primera fila de Claude aparece ≤ 1,5 s después de escribirse en el JSONL | ✅ pasa | [final.png](tmux-latencia/final.png) | {"jsonlMs":3927,"domMs":4208,"latenciaMs":281} |
| `tmux/rafaga` | cada mensaje 1 vez en el JSONL | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"enJsonl":[1,1,1,1,1]} |
| `tmux/rafaga` | cada mensaje 1 vez en el DOM | ✅ pasa | [final.png](tmux-rafaga/final.png) | {"enDom":[1,1,1,1,1]} |
| `tmux/rafaga` | un solo proceso claude en el proyecto | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"durante":["3407234"],"despues":["3407234"]} |
| `tmux/rafaga` | todos contestados | ✅ pasa | [frames-0.json](tmux-rafaga/frames-0.json) | {"respondidos":[1,1,1,1,1]} |
| `tmux/recarga` | el ack de suscripción dice que está procesando | ✅ pasa | [frames-0.json](tmux-recarga/frames-0.json) | {"isProcessing":true,"runsInTmux":true} |
| `tmux/recarga` | tras recargar, el indicador sigue | ✅ pasa | [tras-recargar.png](tmux-recarga/tras-recargar.png) |  |
| `tmux/turno-corto` | cada turno pasa a libre ≤ 3 s después de que se ve la respuesta | ✅ pasa | [final.png](tmux-turno-corto/final.png) | [-47,-63,-59] |
| `tmux/turno-corto` | cada respuesta aparece una vez | ✅ pasa | [frames-0.json](tmux-turno-corto/frames-0.json) | [1,1,1] |
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
| `visual/bocetos` | cuestionario: movil/light sin scroll horizontal | ✅ pasa | [cuestionario-movil-light.png](visual-bocetos/cuestionario-movil-light.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: movil/light consola sin errores | ✅ pasa | [cuestionario-movil-light.png](visual-bocetos/cuestionario-movil-light.png) | [] |
| `visual/bocetos` | cuestionario: movil/dark sin scroll horizontal | ✅ pasa | [cuestionario-movil-dark.png](visual-bocetos/cuestionario-movil-dark.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: movil/dark consola sin errores | ✅ pasa | [cuestionario-movil-dark.png](visual-bocetos/cuestionario-movil-dark.png) | [] |
| `visual/bocetos` | cuestionario: escritorio/light sin scroll horizontal | ✅ pasa | [cuestionario-escritorio-light.png](visual-bocetos/cuestionario-escritorio-light.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: escritorio/light consola sin errores | ✅ pasa | [cuestionario-escritorio-light.png](visual-bocetos/cuestionario-escritorio-light.png) | [] |
| `visual/bocetos` | cuestionario: escritorio/dark sin scroll horizontal | ✅ pasa | [cuestionario-escritorio-dark.png](visual-bocetos/cuestionario-escritorio-dark.png) | {"desborde":0} |
| `visual/bocetos` | cuestionario: escritorio/dark consola sin errores | ✅ pasa | [cuestionario-escritorio-dark.png](visual-bocetos/cuestionario-escritorio-dark.png) | [] |
| `visual/chat` | chat movil-light: ninguna fuente serif en los mensajes | ✅ pasa | [chat-movil-light.png](visual-chat/chat-movil-light.png) |  |
| `visual/chat` | chat movil-light: sin scroll horizontal | ✅ pasa | [chat-movil-light.png](visual-chat/chat-movil-light.png) | {"desborde":0} |
| `visual/chat` | chat movil-light: consola sin errores | ✅ pasa | [chat-movil-light.png](visual-chat/chat-movil-light.png) | [] |
| `visual/chat` | chat movil-dark: ninguna fuente serif en los mensajes | ✅ pasa | [chat-movil-dark.png](visual-chat/chat-movil-dark.png) |  |
| `visual/chat` | chat movil-dark: sin scroll horizontal | ✅ pasa | [chat-movil-dark.png](visual-chat/chat-movil-dark.png) | {"desborde":0} |
| `visual/chat` | chat movil-dark: consola sin errores | ✅ pasa | [chat-movil-dark.png](visual-chat/chat-movil-dark.png) | [] |
| `visual/chat` | chat escritorio-light: ninguna fuente serif en los mensajes | ✅ pasa | [chat-escritorio-light.png](visual-chat/chat-escritorio-light.png) |  |
| `visual/chat` | chat escritorio-light: sin scroll horizontal | ✅ pasa | [chat-escritorio-light.png](visual-chat/chat-escritorio-light.png) | {"desborde":0} |
| `visual/chat` | chat escritorio-light: consola sin errores | ✅ pasa | [chat-escritorio-light.png](visual-chat/chat-escritorio-light.png) | [] |
| `visual/chat` | chat escritorio-dark: ninguna fuente serif en los mensajes | ✅ pasa | [chat-escritorio-dark.png](visual-chat/chat-escritorio-dark.png) |  |
| `visual/chat` | chat escritorio-dark: sin scroll horizontal | ✅ pasa | [chat-escritorio-dark.png](visual-chat/chat-escritorio-dark.png) | {"desborde":0} |
| `visual/chat` | chat escritorio-dark: consola sin errores | ✅ pasa | [chat-escritorio-dark.png](visual-chat/chat-escritorio-dark.png) | [] |
| `visual/cuestionario` | cuestionario movil-light: la opción entra en pantalla | ✅ pasa | [cuestionario-movil-light.png](visual-cuestionario/cuestionario-movil-light.png) | {"x":25,"y":578,"width":291,"height":52} |
| `visual/cuestionario` | cuestionario movil-light: sin scroll horizontal | ✅ pasa | [cuestionario-movil-light.png](visual-cuestionario/cuestionario-movil-light.png) | {"desborde":0} |
| `visual/cuestionario` | cuestionario movil-light: consola sin errores | ✅ pasa | [cuestionario-movil-light.png](visual-cuestionario/cuestionario-movil-light.png) | [] |
| `visual/cuestionario` | cuestionario movil-dark: la opción entra en pantalla | ✅ pasa | [cuestionario-movil-dark.png](visual-cuestionario/cuestionario-movil-dark.png) | {"x":25,"y":578,"width":291,"height":52} |
| `visual/cuestionario` | cuestionario movil-dark: sin scroll horizontal | ✅ pasa | [cuestionario-movil-dark.png](visual-cuestionario/cuestionario-movil-dark.png) | {"desborde":0} |
| `visual/cuestionario` | cuestionario movil-dark: consola sin errores | ✅ pasa | [cuestionario-movil-dark.png](visual-cuestionario/cuestionario-movil-dark.png) | [] |
| `visual/cuestionario` | cuestionario escritorio-light: la opción entra en pantalla | ✅ pasa | [cuestionario-escritorio-light.png](visual-cuestionario/cuestionario-escritorio-light.png) | {"x":335,"y":518,"width":834,"height":52} |
| `visual/cuestionario` | cuestionario escritorio-light: sin scroll horizontal | ✅ pasa | [cuestionario-escritorio-light.png](visual-cuestionario/cuestionario-escritorio-light.png) | {"desborde":0} |
| `visual/cuestionario` | cuestionario escritorio-light: consola sin errores | ✅ pasa | [cuestionario-escritorio-light.png](visual-cuestionario/cuestionario-escritorio-light.png) | [] |
| `visual/cuestionario` | cuestionario escritorio-dark: la opción entra en pantalla | ✅ pasa | [cuestionario-escritorio-dark.png](visual-cuestionario/cuestionario-escritorio-dark.png) | {"x":335,"y":518,"width":834,"height":52} |
| `visual/cuestionario` | cuestionario escritorio-dark: sin scroll horizontal | ✅ pasa | [cuestionario-escritorio-dark.png](visual-cuestionario/cuestionario-escritorio-dark.png) | {"desborde":0} |
| `visual/cuestionario` | cuestionario escritorio-dark: consola sin errores | ✅ pasa | [cuestionario-escritorio-dark.png](visual-cuestionario/cuestionario-escritorio-dark.png) | [] |
| `visual/header-barra` | header movil-light: la cuota de 5 h se ve con su % | ✅ pasa | [header-movil-light.png](visual-header-barra/header-movil-light.png) | {"texto":"Ventana 5h 41% Semanal 72%"} |
| `visual/header-barra` | header movil-light: sin scroll horizontal | ✅ pasa | [header-movil-light.png](visual-header-barra/header-movil-light.png) | {"desborde":0} |
| `visual/header-barra` | header movil-light: consola sin errores | ✅ pasa | [header-movil-light.png](visual-header-barra/header-movil-light.png) | [] |
| `visual/header-barra` | header movil-dark: la cuota de 5 h se ve con su % | ✅ pasa | [header-movil-dark.png](visual-header-barra/header-movil-dark.png) | {"texto":"Ventana 5h 41% Semanal 72%"} |
| `visual/header-barra` | header movil-dark: sin scroll horizontal | ✅ pasa | [header-movil-dark.png](visual-header-barra/header-movil-dark.png) | {"desborde":0} |
| `visual/header-barra` | header movil-dark: consola sin errores | ✅ pasa | [header-movil-dark.png](visual-header-barra/header-movil-dark.png) | [] |
| `visual/header-barra` | header escritorio-light: la cuota de 5 h se ve con su % | ✅ pasa | [header-escritorio-light.png](visual-header-barra/header-escritorio-light.png) | {"texto":"Ventana 5h 41% dato real · resetea en 3 h 0 min Semanal 72% dato real · resetea en 96 h 0 min"} |
| `visual/header-barra` | barra escritorio-light: las sesiones muestran su estado | ✅ pasa | [header-escritorio-light.png](visual-header-barra/header-escritorio-light.png) | {"rotulos":20} |
| `visual/header-barra` | header escritorio-light: sin scroll horizontal | ✅ pasa | [header-escritorio-light.png](visual-header-barra/header-escritorio-light.png) | {"desborde":0} |
| `visual/header-barra` | header escritorio-light: consola sin errores | ✅ pasa | [header-escritorio-light.png](visual-header-barra/header-escritorio-light.png) | [] |
| `visual/header-barra` | header escritorio-dark: la cuota de 5 h se ve con su % | ✅ pasa | [header-escritorio-dark.png](visual-header-barra/header-escritorio-dark.png) | {"texto":"Ventana 5h 41% dato real · resetea en 3 h 0 min Semanal 72% dato real · resetea en 96 h 0 min"} |
| `visual/header-barra` | barra escritorio-dark: las sesiones muestran su estado | ✅ pasa | [header-escritorio-dark.png](visual-header-barra/header-escritorio-dark.png) | {"rotulos":20} |
| `visual/header-barra` | header escritorio-dark: sin scroll horizontal | ✅ pasa | [header-escritorio-dark.png](visual-header-barra/header-escritorio-dark.png) | {"desborde":0} |
| `visual/header-barra` | header escritorio-dark: consola sin errores | ✅ pasa | [header-escritorio-dark.png](visual-header-barra/header-escritorio-dark.png) | [] |
| `visual/salidas` | arrastrar el borde izquierdo agranda el panel de Salidas | ✅ pasa | [antes-de-arrastrar.png](visual-salidas/antes-de-arrastrar.png) [panel-agrandado.png](visual-salidas/panel-agrandado.png) | {"panelAntes":320,"panelDespues":620} |
| `visual/salidas` | arrastrar la manija entre lista y vista previa agranda la lista | ✅ pasa | [lista-agrandada.png](visual-salidas/lista-agrandada.png) | {"listaAntes":144,"listaDespues":264} |
| `visual/salidas` | los dos anchos sobreviven a recargar la página | ✅ pasa | [despues-de-recargar.png](visual-salidas/despues-de-recargar.png) | {"panelDespues":620,"panelRecarga":620,"listaDespues":264,"listaRecarga":264} |
| `visual/salidas` | "Pestaña nueva" abre la salida HTML renderizada en otra pestaña | ✅ pasa | [pestana-nueva.png](visual-salidas/pestana-nueva.png) | {"url":"blob:http://127.0.0.1:3902/f9e5483d-b2ec","titulo":"Salida de prueba ppl680"} |
| `visual/salidas` | el HTML abierto en la pestaña nueva no puede leer el localStorage de la app | ✅ pasa | [pestana-nueva.png](visual-salidas/pestana-nueva.png) | {"origen":"BLOQUEADO","sandbox":"allow-scripts allow-popups"} |
| `barra/orquestador` | orquestar.py crear aparece en la barra abierta en ≤ 3 s, 5 de 5 | ✅ pasa | [cinco-creaciones.png](barra-orquestador/cinco-creaciones.png) | {"exitos":5,"intentos":[{"intento":0,"nombre":"e2e-orq-0-ejecutora-1","sid":"2093ecff-edf4-419a-a480-1c73179d9b39","tFilaMs":2706,"tBajaMs":342},{"intento":1,"nombre":"e2e-orq-1-ejecutora-1","sid":"a16dade0-5daa-4623-b95 |
| `barra/orquestador` | orquestar.py dormir cambia el estado en vivo (la fila sale de la barra sin recargar) | ✅ pasa | [antes-dormir.png](barra-orquestador/antes-dormir.png) [despues-dormir.png](barra-orquestador/despues-dormir.png) | {"antesDormir":21,"tBajaMs":418,"nombre":"e2e-orq-4-ejecutora-1","sid":"9d671608-95e9-46b5-aff8-e0f4ad61aa4f","dormidaOk":true} |
| `a11y/chat` | chat movil-light: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | cuestionario movil-light: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | chat movil-dark: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | cuestionario movil-dark: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | chat escritorio-light: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | cuestionario escritorio-light: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | chat escritorio-dark: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
| `a11y/chat` | cuestionario escritorio-dark: axe sin serias ni críticas | ✅ pasa | [frames-0.json](a11y-chat/frames-0.json) | [] |
---

## Lectura — Fase 12, pasos 1 y 2 (8-oct-2026)

**Resultado:** 214 pasan, 0 fallan y 2 bloqueados, en `:3901` (Claude real) y `:3902` (CLI falso), con build de `diseno/propio` en `/tmp/cloudcli-e2e/app`. Instancias aisladas en tres cosas: `cuota.json` por puerto, socket de tmux propio (`TMUX_TMPDIR`) y registro de sesiones propio (`AOS_SESIONES_REGISTRO_PATH`).

### Cómo se llegó al verde

La corrida conjunta (`todo --con-cuota`) dio 208 bien y 6 mal. Las 6 se arreglaron en la causa y se volvieron a correr solo esos escenarios, que reemplazan sus filas en este informe:

| Escenario | Qué fallaba | Causa | Arreglo |
|---|---|---|---|
| `a11y/chat` (4 checks, tema claro) | axe `color-contrast` en el `30%` del indicador de cuota | Producto: una lectura vieja apagaba el texto con `opacity-60` y bajaba el contraste de 4,5:1. No había aparecido antes porque la instancia mostraba "sin leer aún" | `UsageWindowIndicator`: lo viejo va con `text-ds-muted`, el gris del rótulo, que ya pasa axe. Test unitario: rojo sin el arreglo, verde con él. **Revalidado con el estado viejo a la vista:** `:3902` reiniciada limpia, solo una lectura de hace 20 min, y la API la siguió sirviendo al terminar la corrida (`leidoEn` sin cambios) |
| `barra/orquestador` (2 checks) | la fila de `orquestar.py crear` aparecía 1 de 5 veces; `dormir` no la sacaba | Arnés: con el registro aislado, `hibernar.py` seguía escribiendo `hibernadas.json` en `~/.cache/aos/`, y el vigía de la instancia escucha el directorio del registro | `hibernar.py` (workspace-leandro `25faf16c`): con `AOS_SESIONES_REGISTRO_PATH`, `hibernadas.json` va al lado del registro. Verde 5 de 5, y `dormir` saca la fila en 418 ms |

Efecto colateral del mismo hueco, ya resuelto: las corridas del arnés del 7 y 8 de octubre habían dejado 11 entradas `e2e-*` en el `hibernadas.json` real. Se sacaron (copia previa en el scratchpad de la sesión) y la revalidación no dejó ninguna nueva.

### Arreglos del día, en verde en esta corrida

- Mensaje con captura adjunta (`d27ef84c`): `tmux/adjunto`.
- Nombres humanos y estado de la barra (`851b86e1`, `7475c447`): `barra/nombres` y `barra/estado-vivo`.
- Borrador de tmux tras un AskUserQuestion (`762bdc80`, merge `2e2f5d60`): `pregunta/tmux-multi`.
- Cuadro de texto con más de 8 líneas (`b8041c9a`): no tiene escenario e2e. Lo cubren los unitarios con panes reales (`tmux-cuadro-panes-reales.test.ts`), dentro del verde de server.

### Unitarios

- Cliente: `NODE_ENV=test npx vitest run` → 810/810.
- Server: `NODE_ENV=test npm test` → 934 bien, 0 mal y 1 omitido (`6599520e`). Las 4 fallas que había eran de los tests:
  - `claude-cuenta-env` heredaba `AOS_CUENTA=personal`.
  - Los dos de `shell-tmux` apuntaban a un worktree ya borrado.
  - `claude-runtime-hold` dependía del reloj: fallaba en 3 de 8 corridas bajo carga, siempre del lado positivo.

### Bloqueados

`headless/pensamiento` (2 checks) necesita `CLAUDE_CODE_OAUTH_TOKEN` en `:3901`. La suite no maneja credenciales: decide Leandro. Ese check ya se había revalidado con token el 06-oct (`e2e/evidencia/revalida-fase-4/`).
