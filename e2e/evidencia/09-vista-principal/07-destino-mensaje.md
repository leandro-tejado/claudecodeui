# Fase 7 — a dónde va cada mensaje

**Fecha:** 9-oct-2026 · **Estado:** sin reproducción todavía (n = 0)

## El caso (verificado el 9-oct, ver el plan)

Leandro le escribió a lo que creía la Session Orquestadora y el mensaje creó una sesión nueva en `clientes/optimum`, con la cuenta optimum. El compositor crea una sesión cuando no tiene `selectedSession` ni `currentSessionId` (`useChatComposerState.ts`, rama `if (!targetSessionId)`), y la crea en el proyecto seleccionado sin decirlo.

## Qué se cambió

1. **El destino se ve antes de mandar.** Sin sesión, arriba del compositor aparece una línea: «Sesión nueva en **<proyecto>** · <cuenta>», con la ruta en el `title`. Sale de lo mismo que usa el envío: `selectedProject` y la cuenta elegida para la sesión nueva. Prueba: `src/modules/chat/tests/composerControles.test.tsx`.
2. **Un rechazo del servidor devuelve el texto al cuadro, si el cuadro está vacío.** Antes esto pasaba solo con `PANE_NOT_AT_PROMPT` y `PANE_INPUT_NOT_EMPTY`; ahora pasa con todo rechazo, salvo los que pudieron dejar texto en el pane: `PANE_SEND_UNCONFIRMED` y `TMUX_SEND_FAILED`. Prueba nueva en `messageDeliveryStatus.test.tsx`: falló sin el arreglo (1 de 12) y pasa con él.
3. **Al crear una sesión, el 409 del servidor muestra su motivo** («RAM del servidor al N %…») en vez del código. Se hizo en la Fase 3.

## La causa del clic: pendiente

El escenario `vista/destino-mensaje` recorre cinco caminos hacia el compositor vacío, N vueltas cada uno:

- el «+»;
- el nombre del proyecto;
- la recarga en `/`;
- el proyecto colapsado y reabierto;
- una sesión abierta y la vuelta al proyecto.

En cada intento anota si quedó en una sesión o en el compositor vacío, y si la línea avisó. Con `E2E_REPETICIONES=2` son 10 intentos.

**No se corrió.** La instancia e2e necesita `vite build` y el VPS no tenía RAM: el build murió con `Killed` y quedaban 1,2 GB libres. Hasta correrlo, la causa sigue **sin reproducir con n = 0**. Este documento no cierra el check «n ≥ 10».
