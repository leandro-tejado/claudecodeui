# Inventario de actualización en vivo

Fase 8 de `plans/05-octubre-revision-punta-a-punta.md`, Paso 1. Por cada componente que
muestra estado del servidor: de dónde se entera de que ese estado cambió sin que nadie
recargue — evento WS, polling, o nada — y qué dio con la línea base (`e2e/evidencia/00-linea-base/`).

Una nota antes de la tabla: **la barra que se ve en la app no es `src/modules/sidebar/`.**
Ese módulo quedó de `Sidebar.tsx`, reemplazado por `SkinSidebar` (`src/modules/skin/SkinSidebar.tsx`,
montado desde `ProjectSidebarRegion.tsx`); lo único que `sidebar/` sigue aportando al render es
alguna utilidad suelta (`normalizeProjectForSettings` para el modal de ajustes). Los deltas de
WS que importan para la barra (`session_upserted`, `sidebar_archived`, `websocket_reconnected`)
se procesan en `src/modules/project-workspace/hooks/useProjectsState.ts`, de ahí para abajo —
es el archivo correcto para tocar, y el que esta fase tocó.

## Barra y lista de sesiones

**Evento WS.** `session_upserted` (upsert de una fila) y `sidebar_archived` (saca filas/proyectos)
son los dos productores — `session-upsert-broadcast.service.ts` y
`sidebar-archived-broadcast.service.ts`, los dos únicos (comentario "productor único" en cada
uno). Los consume `useProjectsState.ts:~780-810`.

Quién los dispara, antes de esta fase:
- Un turno de chat que escribe el `.jsonl` (via el run registry).
- La limpieza automática (`limpieza/ejecucion.service.ts`) y borrar un proyecto entero
  (`project-delete.service.ts`), los dos con `sidebar_archived`.
- El watcher de `.jsonl` por disco (`sessions-watcher.service.ts`, el bloque de `PROVIDER_WATCH_PATHS`
  — Fase 7 lo toca para el inotify por sesión, no esta fase).
- El registro de tmux (`~/.cache/aos/sesiones.json`), pero solo por **polling cada 3 s**
  (`chokidar` con `usePolling`) — medido en la línea base: una sesión nueva del orquestador
  tardó **4,45 s** en aparecer.

**Lo que la línea base marcó como roto y de verdad lo estaba, no solo en teoría — verificado
corriendo `barra/archivar` antes del fix (`tBajaMs: null`) y después (`tBajaMs: 36`):**
archivar o borrar una sesión a mano desde la UI (`DELETE /sessions/:id`, con o sin `force`) y
restaurarla (`POST /sessions/:id/restore`) **nunca llamaban a `broadcastSidebarArchived`/
`broadcastSessionUpserted`** — `deleteOrArchiveSessionById` y `restoreSessionById`
(`sessions.service.ts`) solo tocaban la base. La pestaña que hizo la acción la seguía viendo
en la barra, y cualquier otra también, hasta que alguien recargaba. Es la misma fila de la
línea base ("Una sesión archivada desde fuera nunca sale de la barra abierta") — el verbo
"desde fuera" no era el matiz: pasaba archivando desde la propia pestaña también. Arreglado
con un `broadcastSidebarArchived({ sessionIds: [sessionId] })` en las dos ramas de
`deleteOrArchiveSessionById` (archivar y borrar) y un `broadcastSessionUpserted(sessionId)` en
`restoreSessionById` (como con cualquier fila reactivada, un `sidebar_archived` no sabe traerla
de vuelta). Tampoco tenía que ver con `sessions-watcher.service.ts` ni con tmux: es el mismo
"productor único" que ya existía, al que nadie llamaba desde esta ruta.

**Qué se arregló acá (Pasos 2 y 4):**
1. `sessions-watcher.service.ts` ahora también vigila ese directorio con `fs.watch` nativo,
   debounce de 200 ms — el polling de 3 s queda de respaldo (son los dos `watcher.on('add'/'change')`
   que llaman a `scheduleRegistroSync()`). Saca la demora de hasta 3 s de la ruta rápida.
2. `orquestar.py dormir` mata el pane con `kill-session` pero **nunca reescribe `sesiones.json`**
   — anota en `hibernadas.json` (mismo directorio, para poder revivirla) y nada más. El registro
   seguía diciendo `"estado": "viva"` para siempre. `sincronizarSesionesTmuxSinTranscript`
   (`tmux-registry-sessions.service.ts`) ahora verifica contra tmux de verdad (`has-session`)
   las filas que ya eran pendientes antes de la pasada — acotado a esas, no a todo el registro —
   así que una pendiente dormida se poda igual aunque el registro quede desactualizado.
3. Podar esa fila ahora avisa: `onRegistroDirectoryChange` manda `broadcastSidebarArchived({ sessionIds: podadas })`
   — antes la poda era silenciosa (nadie se enteraba sin recargar).

No alcanza (ni hace falta) para una sesión que **ya tiene transcript**: ahí "vivo" se
recalcula en cada `session_upserted`/listado desde el registro de siempre (`resolverTmux` en
`projects-with-sessions-fetch.service.ts`), y nada empuja un `session_upserted` nuevo solo porque
el pane murió. Igual que antes de esta fase — no estaba en el Alcance (`Ignorar: tmux bridge`,
y esa pieza es del lado de la Fase 7) y el caso que mide `barra/orquestador` es justo el de la
sesión sin transcript todavía.

## Estado de cada sesión (badge de processing/idle)

**Evento WS**, pero del chat (`stream_delta`, `stream_end`, `status`), no de esta fase —
`Ignorar: chat` en el Alcance. `isSessionProcessing` en `useProjectsState.ts` lo deriva de ahí.

## Títulos

**Evento WS**, el mismo `session_upserted` (`session.summary`): no hay un delta separado para
"cambió el título", y no hace falta — cualquier cosa que dispara un upsert ya lleva el nombre
actual (`custom_name`). Cubierto por la Fase 1-6 de atrás (generación de título) y por el fix de
este plan `1329d865`/`4158e887` del lado del streaming, no por esta fase.

Lo que sí era de esta fase y estaba roto, verificado con `barra/componentes`: **renombrar a mano**
(`PUT /sessions/:id`, `sessionsService.renameSessionById`) guardaba el nombre nuevo y no avisaba
a nadie — ni a la propia pestaña que lo pidió. Arreglado agregando el mismo
`broadcastSessionUpserted(sessionId)` que ya usa cualquier otra fila nueva o reactivada.

## Header de cuota (ventana de 5h / 7d)

**Evento WS + `fs.watch`** desde la Fase 3: el server vigila el directorio de `cuota.json` (debounce de 300 ms, respaldo cada 60 s) y emite `usage_window`. En la línea base estaba roto ("Ventana de 5 horas: sin dato" con el archivo recién escrito); verificado con `cuota/en-vivo` (1,4 s sin recargar).

## Panel git

**Nada.** `useGitPanelController.ts` pide `git status`/branches/remote una sola vez al elegir
el proyecto (o al entrar a la pestaña de historial) y de ahí en más solo vuelve a pedir por una
acción del propio usuario en el panel (`fetch`/`pull`/`push`/commit, cada una llama a
`refreshAll()`). Está bien así para esta fase: el repo lo cambian el propio usuario desde el panel
(que ya se refresca solo) o el agente desde el chat (que el usuario ve respondiendo en el chat,
no mirando el panel de git a la vez) — nadie más lo toca por afuera sin que el usuario después
abra o reabra la pestaña. Vigilar `.git` entero por fs para un panel que nadie más escribe en
vivo es una fase aparte, no "cambios chicos y localizados".

## Árbol de archivos

**Nada**, con la misma salvedad. `useFileTreeData.ts` pide el árbol al elegir proyecto y expone
`refreshFiles()` para que las operaciones de la propia UI (crear/borrar/subir desde el árbol) lo
disparen — no hay nada que avise si el agente (en una sesión de tmux, por ejemplo) crea o borra
un archivo mientras el árbol está abierto. Mismo argumento que el panel de git: vigilar el
directorio del proyecto entero por fs es una fase propia (y cara: cualquier proyecto grande).

## Tareas (TaskMaster)

**Evento WS**, ya en vivo: `taskmaster-tasks-updated` y `taskmaster-project-updated`
(`TaskMasterContext.tsx:307-333`) disparan `refreshTasks()`/`refreshCurrentProjectTaskMaster()`
filtrando por el proyecto seleccionado. No hizo falta tocar nada.

## Notificaciones

**Evento WS**, por un socket propio: `BrowserNotificationsContext.tsx` abre su propia conexión
(no la de `WebSocketContext.tsx`) para las notificaciones del navegador/push. Fuera del Alcance
de esta fase (no es la barra ni el estado de sesión) — queda solo documentado.

## Reconexión del WS (pestaña oculta, Paso 6)

**"Ya existía" era cierto a medias — verificado en esta fase con el escenario
`barra/pestana-oculta`, que al principio daba falso.** `WebSocketContext.tsx` corre un watchdog
cada 10 s (`WATCHDOG_INTERVAL_MS`) y además revisa al volver la pestaña a visible y al recuperar
red; si pasaron ≥ 70 s (`SILENCE_TIMEOUT_MS`) sin ningún frame — ni siquiera un `heartbeat`, que
el server manda cada 25 s — recicla el socket. Al reabrir, `onopen` manda el evento sintético
`websocket_reconnected`, que en `useProjectsState.ts:~750` dispara `refreshProjectsSilently()` —
eso sí disparaba bien (`hayRefrescoDeCatchUp` salía `true` desde la primera corrida real).

Lo que NO hacía bien ese refresco: `mergeExpandedSessionPages` (la misma función, mismo archivo)
existe para no perder sesiones ya cargadas por "cargar más" cuando una página default vuelve con
menos — pero no distinguía esa paginación de que una sesión de verdad se archivó mientras el
socket estaba mudo. Las dos se ven igual desde adentro ("la página nueva trae menos sesiones que
las que ya tenía cargadas"), así que la sesión archivada se volvía a pegar en cada refresco,
incluido el del catch-up. Verificado en vivo: `tBajaMs: null` con `hayRefrescoDeCatchUp: true`
(el refresco SÍ pasó, y SÍ volvió a mostrar la sesión archivada) antes del fix; `tBajaMs: 10` con
el mismo `hayRefrescoDeCatchUp: true` después. Arreglado comparando contra el total que manda el
server (`sessionMeta.total`, ya lo mandaba — no hizo falta ningún cambio de server): si ese total
es menor que lo que ya había cargado, de verdad hay menos sesiones ahora, y no corresponde pegar
las viejas de vuelta.

El escenario no esperó los 5 minutos reales — ver la nota de "qué hice" en
`e2e/escenarios/barra/pestana-oculta.mjs`, que también documenta dos simulaciones que se probaron
y NO funcionaron (`document.visibilityState` sin cortar nada, y `page.context().setOffline`, que
no corta una conexión WebSocket ya abierta en este Playwright/Chromium).
