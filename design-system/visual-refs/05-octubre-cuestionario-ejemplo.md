> Este ejemplo lo propuso el orquestador, no Leandro: decisión de Leandro del 06-oct de no pasar
> él un prompt armado — el ejemplo lo arma el agente y Leandro aprueba (o no) el boceto construido
> sobre él (paso 1 y 6 de la Fase 10, `plans/05-octubre-revision-punta-a-punta.md`).

# Ejemplo — cuestionario de alcance antes de implementar

## El mensaje que lo dispara

Leandro, en una sesión de tmux sobre `cloudcli` (el mismo repo de este boceto), escribe:

> "Agregale al panel de sesiones un botón para exportar el estado de las sesiones a un archivo.
> Antes de tocar nada, fijate qué alcance tiene sentido y preguntame lo que haga falta."

Es el caso real que más se repite en su trabajo con agentes de código: antes de escribir una
línea, el agente corta y pregunta alcance en vez de asumirlo — exactamente lo que REGLA 13 y la
Fase 10 piden bocetar.

## Las cuatro preguntas (paso a paso, una por pantalla)

**1 de 4 — ¿Qué sesiones entran en la exportación?** *(opción única)*
1. Solo la sesión activa
2. Todas las que están visibles en la barra ahora
3. Todas, incluidas las archivadas

**2 de 4 — ¿Qué columnas incluís?** *(selección múltiple)*
1. Nombre y rol
2. Estado (pensando / esperando / libre / dormida)
3. Antigüedad de la sesión
4. Modelo
5. Tokens consumidos en la ventana de 5 h

**3 de 4 — ¿Dónde queda el archivo?** *(con "Otra" + texto libre)*
1. Se descarga directo del navegador
2. Se guarda en `~/Downloads` del VPS
3. Otra — texto libre (ej.: *"a `~/.cache/aos/export-sesiones.csv`, para que lo lea el timer"*)

**4 de 4 — ¿Formato?** *(opción única)*
1. CSV
2. JSON

## Revisión antes de enviar

Resumen de las cuatro respuestas, con un link "Cambiar" por pregunta que vuelve a ese paso sin
perder el resto. Solo al confirmar ahí se manda.

## Resumen en el transcript (una sola vez)

Tras "Enviado", el transcript deja **una** línea de actividad genérica ("Alcance de la exportación · listo") y la respuesta de Claude, una sola vez — no la tarjeta de actividad con el
texto pendiente *y* un bloque aparte repitiendo lo mismo (el bug del punto 6 de
`e2e/evidencia/00-linea-base/lectura.md`):

> Listo — exporto la sesión activa con nombre, estado y tokens, a `~/.cache/aos/export-sesiones.csv`, en CSV.

Las respuestas de este recorrido son las del boceto: sesión activa · nombre y rol + estado + tokens ·
"Otra" → `~/.cache/aos/export-sesiones.csv` · CSV. (Alineado al boceto aprobado por Leandro el 06-oct.)

Misma cara en headless y en tmux: el componente no cambia según de dónde vino el turno, solo
una etiqueta chica de sesión arriba del todo lo distingue.
