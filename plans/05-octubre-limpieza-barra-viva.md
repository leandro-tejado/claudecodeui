# Limpieza automática de la barra y barra que se actualiza sola

**Fecha:** 05 de Octubre 2026
**Estado:** en-ejecucion

La barra lateral de CloudCLI pasa a mostrar pocos proyectos: quedan los 3 con actividad interactiva más reciente más los fijados, y todo lo demás se archiva solo (antes se duermen sus sesiones de tmux). Las sesiones inactivas de más de 72 h también se archivan. Además, toda sesión que cree el orquestador aparece en la barra sin recargar, incluso si cae en un proyecto archivado o reusa un nombre de tmux viejo.

---

## Contexto

Hoy la barra tiene 15 proyectos activos (`prueba-e2e`, `prueba-env`, `prueba-ask-tmux`, `prueba-prompt-tmux`, `diseno-feedback-2`, `leantejado`…) y Leandro quiere ver muy pocos. El 5-oct fallaron dos sesiones creadas por el orquestador:

- **(a)** `estudio-guia-1` no aparecía: el registro tenía el `session_id` de una sesión del 23-sep con el mismo nombre.
- **(b)** `fiesta-music` estaba archivado y la barra lo ocultaba entero, con la sesión nueva adentro.

### Decisiones de Leandro (5-oct)

| Tema | Decisión |
|---|---|
| «Eliminar de la barra» | **Archivar**: `isArchived=1`. El `.jsonl` queda en disco y la vista «Archivados» que ya existe permite restaurarlo. |
| Excepciones | Solo **Workspace Leandro**, que es donde vive la Session Orquestadora fija. El mecanismo es «Fijar arriba» (`isStarred`): lo fijado nunca se archiva. No se fija nada más de entrada. |
| Regla de los 3 | **Tope** (cambio del 5-oct, tarde; antes era un piso): quedan visibles como máximo los 3 proyectos con actividad más reciente, **más** los fijados (estrella; hoy Workspace Leandro). Todo lo demás se archiva en cada corrida aunque tenga menos de 72 h. Si hay 5 activos, se ven 3 más los fijados. Los 72 h siguen rigiendo para las **sesiones**, no para los proyectos. Se mantiene: un proyecto con tmux viva que no se deja dormir no se archiva (queda en `bloqueados` del log); la actividad nueva lo hace reaparecer; archivar el proyecto no archiva sus sesiones. |
| Qué cuenta como actividad | **Solo las sesiones interactivas**: tmux, `ct` y el chat de CloudCLI. Una corrida headless `claude -p` (entrypoint `sdk-cli`) no mantiene vivo un proyecto, y su propia sesión se archiva apenas termina. *Es el valor por defecto propuesto; Leandro no lo eligió explícitamente.* |

### Valores por defecto (no preguntados; se corrigen si hace falta)

- **Ritmo.** El chequeo es continuo, una vez por hora: un proyecto que sale del top 3 sigue visible a lo sumo una hora.
- **Sesiones de tmux.** Se apagan con `orquestar.py dormir`, nunca con `cerrar`. Dormir guarda el `session_id` en `hibernadas.json`, así que se pueden revivir. Nunca se usa `--forzar`.
- **Sesión que no se deja dormir.** Si una sesión de tmux del proyecto se niega a dormir (repo sucio, pregunta pendiente, `web`, `orquestador`), **el proyecto no se archiva**: ocultar una sesión viva es peor que dejar un proyecto de más. Queda en el log y se avisa una vez.
- **Reaparición.** Toda actividad interactiva posterior a `archived_at` desarchiva el proyecto y la sesión, sin importar quién los archivó. Un re-escaneo de transcripts viejos sigue sin resucitarlos, porque su actividad es anterior al archivado.

### Lo que ya existe y este plan no duplica

- **Registro de tmux → barra.** El trabajo encargado a `cloudcli-diseno-guia-1` está todo commiteado y pusheado al 30-sep: `518550e1` y `03c32f82` (registro de tmux → DB → barra), `a0158edb`, `373dc739`, `d8b8a57a`, `8ee2e6bc` y `17dd4c7e`. En el árbol no hay trabajo suyo sin commitear y `dist/` es del 30-sep 17:36. Este plan **extiende** `tmux-registry-sessions.service.ts` y `sessions-watcher.service.ts`, no los reescribe.
- **Sesiones ociosas.** `hibernar.py`, desde `ciclo.py` cada 10 min, ya duerme sesiones de tmux ociosas: guía a las 48 h, ejecutora a las 12 h, y menos cuanto más contexto tienen. La limpieza no reimplementa eso. Solo agrega «apagar todas las del proyecto que se archiva» y lo delega en `orquestar.py`.

### Hallazgos de la Fase 0 que cambian el diseño

1. **Un `claude -p` lanzado desde un pane le roba la entrada al pane.** `registro-sesion.sh` resuelve el nombre con `tmux display-message -p '#S'`. Un hijo `claude -p` hereda `$TMUX`, así que su `SessionStart` pisa el `session_id` del padre. Caso real de hoy: `permisos-ejecutora-1` quedó con `96c915b9`, que es una corrida `sdk-cli` («Corré con Bash, cada uno por separado…»), y no con su sesión `cli`.
2. **`sesiones.py construir()` pisa al hook.** Lee el registro al empezar y escribe al terminar, tras ~2 s parseando transcripts. Si el hook escribe en el medio, esa escritura se pierde. Además reusa el `session_id` previo del mismo **nombre** aunque la sesión de tmux sea otra (`creada` posterior), y descarta `hook_ts`. Así explica la falla (a).
3. **El respaldo por cwd asigna el mismo id a dos sesiones.** `sid_para_cwd` le dio `70a0acfe` a `cloudcli-diseno-guia-1` y a `cloudcli-feedback-guia-1`, que comparten cwd.
4. **(b) es por diseño.** `ensureProjectPathExists` y el upsert de sesiones no tocan `isArchived` a propósito, porque un re-escaneo no debe resucitar un archivado. Falta distinguir un re-escaneo de la actividad nueva, y para eso hace falta `archived_at`.
5. **El chat de CloudCLI escribe `sdk-ts`, no `cli`.** «Headless» es exactamente `sdk-cli`; `cli` y `sdk-ts` son interactivas. Las sesiones de tmux anteriores al 30-sep también dicen `sdk-ts`.
6. **`hibernar.py` no puede dormir nada en `~/cloudcli`.** Lo frena `M package-lock.json` y `?? dist.old/`: `cloudcli-diseno-guia-1` y `cloudcli-feedback-guia-1` llevan 106 h ociosas, marcadas «PROTEGIDA: cambios sin commitear». La limpieza va a chocar con lo mismo (ver Análisis Crítico).

### Restricciones operativas

- No reiniciar `cloudcli` desde una terminal que cuelgue del servicio: hacerlo desde `ct` o ttyd.
- `npm run build && systemctl --user restart cloudcli`, y después hard refresh en el navegador.
- Tests con `NODE_ENV=test npx vitest run`.
- Hay dos repos en juego: `cloudcli` (rama `diseno/propio`) y `workspace-leandro` (`.claude/bin`, `.claude/hooks`). `git pull` antes de tocar cada uno, commit y push al cerrar cada fase.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `workspace-leandro/.claude/hooks/registro-sesion.sh` | modificar: escribir solo si el claude que dispara el hook es el proceso principal del pane |
| `workspace-leandro/.claude/bin/sesiones.py` | modificar: merge contra el registro fresco antes de guardar, conservar `hook_ts`, descartar el sid de un nombre reusado, no repetir sids y filtrar transcripts `sdk-cli` antes de `hibernar.sid_para_cwd` |
| `workspace-leandro/.claude/bin/hibernar.py` | **no se toca** (otra sesión lo edita el 5-oct): el filtro `sdk-cli` vive en `sesiones.py` |
| `workspace-leandro/.claude/bin/test-sesiones.py` | crear: tests de las tres reglas del registro |
| `server/modules/database/schema.ts` + `migrations.ts` | modificar: `projects.archived_at`, `projects.archived_by`, `sessions.archived_at`, `sessions.archived_by`, `sessions.entrypoint` |
| `server/modules/database/repositories/projects.db.ts`, `sessions.db.ts` | modificar: archivar con sello, desarchivar si hay actividad nueva, consultas de actividad |
| `server/modules/providers/services/session-synchronizer.service.ts` (+ adapter de claude) | modificar: leer el `entrypoint` del transcript |
| `server/modules/providers/services/tmux-registry-sessions.service.ts` | modificar: una sesión viva del registro en un proyecto archivado lo desarchiva |
| `server/modules/websocket/services/session-upsert-broadcast.service.ts` | modificar: nuevo productor de `sidebar_archived` |
| `server/modules/limpieza/` | crear: `limpieza.service.ts` (selección pura + ejecución), `limpieza.scheduler.ts`, tests |
| `server/shared/types.ts`, `src/shared/types.ts` | modificar: tipo del evento `sidebar_archived` |
| `src/modules/project-workspace/hooks/useProjectsState.ts` | modificar: aplicar `sidebar_archived` en el lugar, sin refetch |

---

## Micro-tasks

- [x] Hook: `registro-sesion.sh` no escribe si el claude que lo dispara no es el principal del pane — acepta: un `claude -p` corrido dentro de un pane de prueba deja intacto el `session_id` del pane | valida: `python3 .claude/bin/test-sesiones.py` (caso `hijo_no_pisa`) + prueba manual en `zzz-hook-guia-1`
- [x] `sesiones.construir()` hace merge con el registro releído justo antes de `_guardar` — acepta: un hook que escribe a mitad de `construir` sobrevive | valida: `test-sesiones.py` (caso `hook_concurrente`)
- [x] `construir()` descarta el sid previo si la sesión de tmux es más nueva que la entrada (nombre reusado) y conserva `hook_ts` — acepta: la entrada vieja del 23-sep no se hereda | valida: `test-sesiones.py` (caso `nombre_reusado`)
- [x] `sid_para_cwd` ignora transcripts `sdk-cli` y `construir()` no asigna un sid que ya tiene otra sesión viva — acepta: dos sesiones en el mismo cwd nunca comparten sid | valida: `test-sesiones.py` (caso `cwd_compartido`) + `python3 .claude/bin/test-hibernar-tabla.py` sigue verde
- [x] Migración: columnas `archived_at`, `archived_by` en `projects` y `sessions`, y `entrypoint` en `sessions` — acepta: la DB vieja migra sin perder filas y los conteos de antes y después coinciden | valida: `NODE_ENV=test npx vitest run server/modules/database`
- [x] El synchronizer de claude guarda `entrypoint` (`cli` / `sdk-ts` / `sdk-cli`) leyendo las primeras líneas del `.jsonl` — acepta: `96c915b9` queda `sdk-cli` y `4ffcfe3f` queda `cli` | valida: test del synchronizer + query de solo lectura a `auth.db` después del deploy
- [x] Desarchivar con actividad nueva: un upsert de sesión interactiva con actividad posterior a `archived_at` desarchiva sesión y proyecto, y un re-escaneo viejo no | valida: `NODE_ENV=test npx vitest run server/modules/providers server/modules/database`
- [x] La sesión viva del registro de tmux en un proyecto archivado lo desarchiva y emite `session_upserted` — acepta: el caso `fiesta-music` reproducido en test termina con el proyecto activo | valida: `tmux-registry-sessions.service.test.ts`
- [x] Evento `sidebar_archived {projectIds, sessionIds}`: el frontend saca proyectos y sesiones en el lugar, sin `fetchProjects` | valida: test de `useProjectsState` + verificación en navegador
- [x] `seleccionarLimpieza()` pura: tope de 3 (más fijados), umbral de 72 h solo para sesiones, fijados exentos, la sesión fija exenta, headless terminadas a archivar | valida: `NODE_ENV=test npx vitest run server/modules/limpieza` (≥10 casos)
- [x] Ejecutor: por cada proyecto candidato, `orquestar.py dormir` en cada sesión de tmux viva (sin `--forzar`); si alguna se niega, el proyecto no se archiva y queda el motivo | valida: test con `orquestar` falso + log `~/.cache/aos/limpieza.jsonl`
- [x] Scheduler horario + modo `simular` por defecto (`LIMPIEZA_MODO=simular|ejecutar`) — acepta: en `simular` no cambia nada y escribe el plan de cambios en el log | valida: `journalctl --user -u cloudcli | grep limpieza`
- [ ] Fijar Workspace Leandro (`isStarred=1`) — acepta: aparece arriba con la estrella | valida: UI + query de solo lectura
- [ ] Deploy (`npm run build && systemctl --user restart cloudcli` desde ttyd/`ct`) y primera corrida en `simular`; Leandro aprueba la lista | valida: `limpieza.jsonl` mostrado a Leandro
- [ ] Paso a `ejecutar` — acepta: la barra queda con ≤ los proyectos esperados según el simulado, sin recargar | valida: navegador (cloudcli-browser) antes/después
- [ ] E2E (b): crear con `orquestar.py crear` una sesión de prueba en un proyecto archivado — acepta: aparece en la barra sin recargar en < 15 s | valida: snapshot del navegador
- [ ] E2E (a): crear, cerrar y volver a crear una sesión con el mismo nombre — acepta: el registro tiene el sid nuevo y la barra la muestra | valida: `orquestar.py listar --json` + navegador
- [x] Reparar el registro actual: los sids mal asignados (`permisos-ejecutora-1`, el par diseno/feedback) se corrigen con la lógica nueva | valida: `sesiones.py listar` sin sids repetidos entre sesiones vivas

---

## Análisis Crítico

> Completado por Claude en la Fase 2.5. Leandro decide qué se incorpora antes de ejecutar.

### Incongruencias detectadas

- **«Apagar las sesiones del proyecto» choca con «nunca con cambios sin commitear».** Hoy `~/cloudcli` está sucio por ruido (`package-lock.json` modificado por `npm install` y `dist.old/` sin trackear), así que **ninguna** sesión de tmux en cloudcli se va a dormir y, por la regla de arriba, cloudcli nunca se archiva. El invariante es por repo, no por sesión: una sola sesión sucia protege a todas las que comparten el cwd. Ver la sugerencia 1.
- **Desarchivar ante actividad nueva contradice el comentario de upstream** («only an explicit user action should un-archive»). Es deliberado, porque Leandro pidió que lo nuevo aparezca siempre, pero quiere decir que archivar a mano un proyecto donde hay una sesión viva escribiendo no dura: vuelve con el próximo mensaje.

### Huecos no cubiertos

- **Carrera en `sesiones.json`.** El hook y `sesiones.py` escriben sin candado. El merge de la Fase 1 achica la ventana pero no la cierra; un `flock` sobre `sesiones.json.lock` la cerraría (sugerencia 2).
- **El tope de 3 cuenta proyectos con actividad interactiva**, no proyectos con sesiones. Los 3 más recientes quedan aunque lleven más de 72 h (el tope limita, no vacía la barra), y un proyecto sin ninguna sesión interactiva no compite por un lugar: se archiva. Los fijados y el proyecto de la sesión fija no ocupan lugar del tope. Un proyecto frenado por una tmux que no duerme queda visible por encima del tope, con la causa en `bloqueados`.
- **Las ejecutoras que corren `claude -p` como parte de una tarea viva** (como hoy `permisos-ejecutora-1`) dejan sesiones `sdk-cli` que se archivan apenas terminan. Si Leandro quiere leer alguna, está en «Archivados».
- **El hook detecta «proceso principal del pane»** por la cadena de padres (`$PPID` del claude → `env` → `bash -ic` → `pane_pid`). Si `claude-tmux` cambia cómo lanza el proceso, la detección se rompe. Lo cubre el test `hijo_no_pisa`.

### Áreas relacionadas a monitorear

- No existe `graphify-out/` en `cloudcli`, así que esto sale de leer el código.
- `projects-with-sessions-fetch.service.ts`: `resolverTmux` y `leerRegistroSesiones` usan el registro y tienen un cache de 5 s.
- El filtro «solo tmux vivo» de `SkinSidebar.tsx` (`tmuxStats`, «N ocultas») y la entrada fija «Session Orquestadora», que se busca dentro de `projects`. Si su proyecto se archivara, desaparecería: por eso Workspace Leandro va fijado y la sesión fija queda exenta por regla.
- `hibernar.py` / `ciclo.py`: comparten `hibernadas.json` con `orquestar.py dormir`, y la limpieza escribe ahí por el mismo camino.
- `os-organizar` y `sync-repos` lanzan `claude -p` (`sdk-cli`). Pasan a contar como no-actividad.
- `deleteOrArchiveProject` y `restoreArchivedProject` (`project-delete.service.ts`) pasan a escribir `archived_by='user'` y a limpiar `archived_at` al restaurar.

### Zonas intocables

- `tmux-bridge.service.ts`, el envío en tramos (`98b3f53d`) y los prompts de permiso y AskUserQuestion de tmux (`8ee2e6bc`, `17dd4c7e`).
- `KillMode=process` en `deploy/cloudcli.user.service`.
- Las invariantes de `orquestar.py` (`motivo_invariante`, `sesion_propia`): se invocan, no se editan.
- `claude-tmux`: ni el `bash -ic` ni la limpieza de variables heredadas.
- `deleteSessionJsonlFilesForProjectPath`: la limpieza nunca borra transcripts.

### Sugerencias opcionales

- [ ] **1. Sacar el ruido de `~/cloudcli`**: decidir si `package-lock.json` se commitea o se revierte, y borrar `dist.old/` o pasarlo a `.gitignore`. Sin esto, la limpieza no puede apagar nada en cloudcli. Esfuerzo: 5 min, pero lo decide Leandro.
- [ ] **2. `flock` en `registro-sesion.sh` y `sesiones._guardar`** para cerrar la carrera del todo. Esfuerzo: ~30 min con test.
- [ ] **3. Purgar a mano, una vez, los proyectos basura** que no tienen sesiones (`/tmp/prueba-env`, `/home/leantejado/cloudcli/~/workspace-leandro/desarrollo/app-norte`, `/tmp/pruebasub`…) y el directorio literal `~/cloudcli/~`, que se creó por un path mal expandido el 14-sep. Esfuerzo: 10 min.
- [ ] **4. Aviso en Norte** (`/pendiente`) cuando un proyecto lleva más de 7 días sin poder archivarse porque una sesión se niega a dormir. Así no queda una sesión olvidada 100+ h como hoy. Esfuerzo: ~20 min.

---

## Fases

### Fase 1 - Registro de sesiones confiable
**Goal (done-criterion):** Existe `workspace-leandro/.claude/bin/test-sesiones.py` con los casos `hijo_no_pisa`, `hook_concurrente`, `nombre_reusado` y `cwd_compartido`, todos verdes, Y `sesiones.py listar --json` no muestra dos sesiones vivas con el mismo `session_id`, Y está commiteado y pusheado en `workspace-leandro`.
**Alcance:** Tocar: `.claude/hooks/registro-sesion.sh`, `.claude/bin/sesiones.py`, `.claude/bin/test-sesiones.py`. Ignorar: `hibernar.py` (se invoca, no se edita), `orquestar.py`, `ciclo.py`, `claude-tmux`, todo `cloudcli/`.
**Paralelizable:** Sí, con la Fase 2: repos distintos, sin archivos en común.

#### Pasos
1. `git -C ~/workspace-leandro pull`.
2. En `registro-sesion.sh`, antes de escribir, resolver el `pane_pid` de `$TMUX_PANE` (`tmux display-message -p -t "$TMUX_PANE" '#{pane_pid}'`) y subir por la cadena de padres desde `$PPID` (el claude). Escribir solo si el claude cuelga directo de la cadena `pane_pid → (env) → bash -ic → claude`. Si es más profundo, es un hijo `claude -p` y sale sin escribir. Para el nombre, usar `-t "$TMUX_PANE"` en vez de depender del cliente.
3. El hook también escribe `creada` (`#{session_created}`), para que `construir()` pueda comparar.
4. En `sesiones.construir()`, el sid previo se usa solo si `previo.creada` coincide con la `creada` de la sesión de tmux viva. Si la sesión viva es más nueva, el sid previo es de otra sesión con el mismo nombre y se descarta.
5. En `sesiones._guardar()` (o un `guardar_con_merge`), releer el archivo justo antes de escribir. Por cada entrada, si la del disco tiene `hook_ts` más nuevo que el arranque de `construir`, su `session_id` gana. Conservar `hook_ts` en la entrada final.
6. En `construir()`, después de resolver todo, si un sid aparece en más de una sesión viva, queda solo en la que lo trae del hook. En las demás va `null`, que es mejor que un sid equivocado.
7. En `sesiones.construir()`, antes de llamar a `hibernar.sid_para_cwd`, sacar de `ultimo_ctx`/`ultimo_prompt` los sids cuyo transcript sea `entrypoint: sdk-cli` (lectura acotada de las primeras líneas del `.jsonl`).
8. Escribir `test-sesiones.py` con el mismo estilo que `test-hibernar-*.py` (registro en un tmpdir y tmux simulado).
9. Prueba en vivo: `orquestar.py crear zzz-hook guia /tmp`. Adentro corre un `claude -p 'di hola'` y se verifica que el sid de `zzz-hook-guia-1` sigue siendo el del pane. Después `orquestar.py cerrar zzz-hook-guia-1`.
10. Correr `sesiones.py listar` y verificar que no quedan sids repetidos. Commit y push.

#### Estado (arranca todo en fail)
- [pass] Un hijo `claude -p` no pisa al pane (tests con tabla y con procesos reales; prueba en vivo `[sin-verificar]`: gobernador en rojo, `crear` rechazado sin --forzar) | valida: `python3 .claude/bin/test-sesiones.py` + prueba en vivo del paso 9
- [pass] El hook concurrente con `construir()` sobrevive | valida: `test-sesiones.py`
- [pass] Un nombre reusado no hereda el sid viejo | valida: `test-sesiones.py`
- [pass] No hay sids repetidos entre sesiones vivas (registro real tras el merge: 7 vivas, todas `sid_fuente: proceso`, 0 duplicados) | valida: `python3 .claude/bin/sesiones.py listar --json | python3 -c '…contar duplicados…'`
- [pass] Los tests previos siguen verdes | valida: `python3 .claude/bin/test-hibernar-tabla.py && python3 .claude/bin/test-orquestar.py && python3 .claude/bin/test-ciclo.py`

#### Peligros
- El hook tiene un tope de 3 s y bloquea el arranque. Recorrer `/proc/<pid>/stat` es barato, pero no hay que llamar a `ps` en un loop.
- Si la detección del principal falla siempre, el hook deja de escribir y todo cae al respaldo por cwd. El test en vivo del paso 9 tiene que ver un sid escrito **por el hook** (`hook_ts` presente).

#### Mejores prácticas
- Cualquier error en el hook termina en `exit 0`: un hook de `SessionStart` nunca rompe el arranque.

---

### Fase 2 - Esquema: sello de archivado y entrypoint
**Goal (done-criterion):** Existen las columnas `projects.archived_at`, `projects.archived_by`, `sessions.archived_at`, `sessions.archived_by` y `sessions.entrypoint`, creadas por una migración idempotente, Y el synchronizer de claude llena `entrypoint`, Y `NODE_ENV=test npx vitest run server/modules/database server/modules/providers` pasa.
**Alcance:** Tocar: `server/modules/database/{schema,migrations}.ts`, `repositories/{projects,sessions}.db.ts`, el synchronizer y adapter de claude en `server/modules/providers/`, `server/modules/projects/services/project-delete.service.ts` (solo pasar `por`). Ignorar: `src/`, `server/modules/websocket/`, `server/modules/limpieza/`.
**Paralelizable:** Sí, con la Fase 1.

#### Pasos
1. `git -C ~/cloudcli pull`.
2. Migración con el patrón que ya usa `migrations.ts` (`ALTER TABLE … ADD COLUMN` si no existe). `archived_by` vale `'user' | 'auto' | NULL`.
3. `updateProjectIsArchived*` y `updateSessionIsArchived` reciben `por: 'user' | 'auto'`, escriben `archived_at = CURRENT_TIMESTAMP` y `archived_by` al archivar, y los limpian al restaurar. `deleteOrArchiveProject` y `restoreArchivedProject` pasan `'user'`.
4. El synchronizer lee `entrypoint` de las primeras ~10 líneas del `.jsonl`, con la misma lectura acotada que ya usa para el título, y lo guarda solo si la columna está en `NULL`.
5. Backfill: la próxima sincronización completa lo llena para las filas existentes. Sin script aparte.
6. Tests: una DB vieja migra sin perder filas; el entrypoint sale de un `.jsonl` fixture `cli` y de uno `sdk-cli`.

#### Estado (arranca todo en fail)
- [pass] La migración es idempotente y conserva las filas (node:test, no vitest) | valida: `NODE_ENV=test npx vitest run server/modules/database`
- [pass] `entrypoint` se llena desde el `.jsonl` | valida: `NODE_ENV=test npx vitest run server/modules/providers`
- [pass] Archivar a mano escribe `archived_by='user'` | valida: test de `project-delete.service`

#### Peligros
- `auth.db` es la DB viva: la migración corre al arrancar el servicio. No probar contra `~/.cloudcli/auth.db`, sino contra una copia en el scratchpad.

---

### Fase 3 - Lo nuevo siempre aparece (falla b)
**Goal (done-criterion):** Un upsert de sesión interactiva con actividad posterior a `archived_at` desarchiva la sesión y su proyecto y emite `session_upserted`, mientras que un re-escaneo con actividad anterior no lo hace, Y el test que reproduce el caso `fiesta-music` (proyecto archivado + sesión viva nueva en el registro) pasa, Y está commiteado.
**Alcance:** Tocar: `repositories/{projects,sessions}.db.ts`, `tmux-registry-sessions.service.ts`, `session-synchronizer.service.ts` y sus tests. Ignorar: `src/`, `server/modules/limpieza/`, `server/modules/websocket/` (el `session_upserted` sale igual que hoy; ese módulo es de la Fase 4).
**Paralelizable:** Sí, con la Fase 4: archivos distintos. Depende de la Fase 2.

#### Pasos
1. `sessionsDb.reactivarSiHayActividadNueva(sessionId)`: si la sesión o su proyecto están archivados, `entrypoint != 'sdk-cli'` y `updated_at > archived_at`, desarchiva los dos y devuelve `true`.
2. Llamarla desde el upsert del synchronizer (camino del `.jsonl`) y desde `createPendingTmuxSession` (camino del registro, sin transcript). La sesión pendiente de tmux nace ahora, así que siempre es nueva.
3. Si reactivó algo, el `session_upserted` sale igual. El frontend ya crea el proyecto que no conoce desde el payload (`useProjectsState`, «First session of a project this client has never seen»).
4. Tests: `fiesta-music` archivado + una entrada `viva` en el registro termina con el proyecto activo y el evento emitido; un `.jsonl` viejo re-escaneado no reactiva; una sesión `sdk-cli` nueva no reactiva.

#### Estado (arranca todo en fail)
- [pass] Una sesión viva nueva en un proyecto archivado lo desarchiva | valida: `NODE_ENV=test npx vitest run server/modules/providers/tests/tmux-registry-sessions.service.test.ts`
- [pass] Un re-escaneo viejo no resucita | valida: idem, synchronizer
- [pass] Una headless no resucita | valida: idem

---

### Fase 4 - Archivar se ve en vivo
**Goal (done-criterion):** Existe el evento `sidebar_archived { projectIds: string[], sessionIds: string[] }` en `server/shared/types.ts` y `src/shared/types.ts`, con su productor `broadcastSidebarArchived()`, Y `useProjectsState` lo aplica sacando proyectos y sesiones del estado sin llamar a `fetchProjects`, Y su test pasa.
**Alcance:** Tocar: tipos compartidos, `server/modules/websocket/services/sidebar-archived-broadcast.service.ts` (archivo NUEVO, recorre `connectedClients` como el productor de `session_upserted`), `server/modules/projects/services/project-delete.service.ts` (solo emitir el evento), `src/modules/project-workspace/hooks/useProjectsState.ts` y su test. Ignorar: `SkinSidebar.tsx`, `server/modules/limpieza/`, `session-upsert-broadcast.service.ts` y `tmux-prompt.service.ts` (lo edita `cloudcli-diseno-guia-1`).
**Paralelizable:** Sí, con la Fase 3 (sin archivos en común desde el ajuste del 5-oct). Depende de la Fase 2.

#### Pasos
1. Definir el tipo y el productor `broadcastSidebarArchived({projectIds, sessionIds})` en `sidebar-archived-broadcast.service.ts`.
2. En `useProjectsState`, en el handler de eventos: filtrar los `projectIds` y, dentro de los proyectos que quedan, las `sessionIds`. Si la sesión seleccionada quedó archivada, no se la saca de la vista abierta: solo se la saca de la lista.
3. El archivado manual (`deleteOrArchiveProject`) también emite el evento, para que otras pestañas se enteren.
4. Test del reducer con un proyecto y una sesión archivados.

#### Estado (arranca todo en fail)
- [pass] El evento tiene tipo en las dos puntas | valida: `npx tsc --noEmit -p .` sin errores nuevos
- [pass] El frontend saca proyecto y sesión en el lugar | valida: `NODE_ENV=test npx vitest run src/modules/project-workspace`
- [pass] La sesión abierta no se cierra al archivarse | valida: idem

---

### Fase 5 - Servicio de limpieza
**Goal (done-criterion):** Existe `server/modules/limpieza/` con `seleccionarLimpieza()` (pura), `ejecutarLimpieza()` y un scheduler horario arrancado desde el bootstrap del server, Y `NODE_ENV=test npx vitest run server/modules/limpieza` pasa con 10 casos o más, Y en modo `simular` (el defecto) una corrida escribe una línea en `~/.cache/aos/limpieza.jsonl` sin cambiar la DB ni tmux.
**Alcance:** Tocar: `server/modules/limpieza/**`, el bootstrap del server (donde arrancan `initializeSessionsWatcher` y `recursos-broadcast`). Ignorar: `src/`, `orquestar.py`/`hibernar.py` (se invocan, no se editan).
**Paralelizable:** No: depende de las Fases 2, 3 y 4.

#### Pasos
1. **Entrada de `seleccionarLimpieza(ahora, proyectos, sesiones, tmuxVivas)`:** por proyecto, `ultimaActividad` = máximo `updated_at` de sus sesiones con `entrypoint != 'sdk-cli'`. Las `NULL` cuentan como interactivas, para no archivar por falta de dato.
2. **Reglas, en orden:**
   1. Exentos: `isStarred=1`, el proyecto de la sesión `fija` y, de los demás, los 3 con `ultimaActividad` más reciente (el tope; motivo `tope`).
   2. Candidato: todo proyecto activo que no sea exento, tenga la edad que tenga. Los 72 h ya no cuentan para proyectos.
   3. Sesiones a archivar: en proyectos que quedan, las inactivas hace 72 h o más sin tmux vivo; además, toda `sdk-cli` cuyo `.jsonl` no se escribe hace 10 min o más.
   4. Nunca se archiva la sesión `fija`.
3. **`ejecutarLimpieza(plan, modo)`:** por proyecto candidato, por cada sesión de tmux viva cuyo cwd cae dentro del `project_path` (sale del registro), `execFile('python3', [ORQUESTAR, 'dormir', nombre])` sin `--forzar`, con timeout de 20 s.
   - Si alguna devuelve un código distinto de 0, el proyecto **no** se archiva y queda `{proyecto, sesion, motivo}` en el log.
   - Si todas duermen, se archivan el proyecto y sus sesiones con `archived_by='auto'` y se emite `sidebar_archived` en un solo evento.
4. `web` y `orquestador` las protege `orquestar.py`. Igual, por defensa, la limpieza no le pasa nunca esos dos nombres.
5. **Modo:** `LIMPIEZA_MODO` (`simular` por defecto, `ejecutar`) por variable de entorno en la unit. En `simular` loguea el plan entero y no toca nada.
6. **Scheduler:** `setInterval` de 1 h, más una corrida 5 min después del arranque. Nunca dos corridas a la vez: un flag en memoria.
7. **Log:** una línea JSON por corrida en `~/.cache/aos/limpieza.jsonl` (`ts`, `modo`, `archivados`, `dormidas`, `bloqueados`, `exentos`).
8. **Tests:** tope de 3 con 5 activos (se archivan los 2 más viejos aunque tengan menos de 72 h), tope de 3 con 0 activos (quedan 3), fijado que no ocupa lugar del tope, fijado inactivo exento, sesión fija exenta, proyecto reciente fuera del tope con tmux que no duerme (se queda y el log lo avisa), headless terminada archivada, headless corriendo no archivada, `dormir` que falla bloquea el proyecto, `simular` no escribe, dos corridas no se pisan, y un proyecto sin sesiones se archiva sin ocupar lugar del tope.

#### Estado (arranca todo en fail)
- [pass] Selección correcta en los 10 casos o más (19 tests, node:test) | valida: `NODE_ENV=test npx vitest run server/modules/limpieza`
- [pass] `dormir` rechazado bloquea el archivado del proyecto | valida: idem (orquestar simulado)
- [pass] `simular` no toca la DB (corrida sobre una copia de auth.db: filas idénticas antes y después) | valida: idem + conteo de `isArchived` antes y después en la corrida real
- [pass] Línea en `limpieza.jsonl` por corrida (validado con `LIMPIEZA_LOG_PATH`; el archivo real nace con el deploy, `[sin-verificar]` hasta la Fase 6) | valida: `tail -1 ~/.cache/aos/limpieza.jsonl`

#### Peligros
- El `cwd` de una sesión de tmux puede estar en un subdirectorio del proyecto, o en un worktree fuera de él. Se asigna al proyecto con el `project_path` más largo que sea prefijo; si ninguno es prefijo, la sesión no se toca.
- Un `orquestar.py dormir` colgado: el timeout de `execFile` lo corta y cuenta como rechazo.

#### Mejores prácticas
- La selección es pura y testeable, y la ejecución es fina. El mismo patrón que `motivo_invariante` en `orquestar.py`.

---

### Fase 6 - Despliegue y verificación en vivo
**Goal (done-criterion):** El bundle nuevo corre (`dist/` posterior al último commit), la corrida en `simular` está mostrada a Leandro y aprobada, el servicio está en `ejecutar`, Y los dos E2E pasan en el navegador sin recargar: (a) un nombre reusado aparece con el sid nuevo, y (b) una sesión creada en un proyecto archivado aparece en menos de 15 s. Y todo está commiteado y pusheado en los dos repos.
**Alcance:** Tocar: `deploy/cloudcli.user.service` (solo la variable `LIMPIEZA_MODO`), la copia en `~/.config/systemd/user/`, el estrella de Workspace Leandro. Ignorar: código fuera de lo ya hecho.
**Paralelizable:** No.

#### Pasos
1. Fijar Workspace Leandro (clic derecho → Fijar arriba).
2. Desde ttyd (`:10000`) o un `ct` que no cuelgue del servicio: `cd ~/cloudcli && npm run build && systemctl --user restart cloudcli`. Después leer `journalctl --user -u cloudcli -n 50` y hacer hard refresh.
3. Esperar la primera corrida (5 min) en `simular` y mostrarle a Leandro `tail -1 ~/.cache/aos/limpieza.jsonl`, formateado: qué se archiva, qué se duerme y qué queda bloqueado y por qué.
4. Con su OK, agregar `Environment=LIMPIEZA_MODO=ejecutar` en `deploy/cloudcli.user.service`, copiarlo a `~/.config/systemd/user/`, correr `systemctl --user daemon-reload && systemctl --user restart cloudcli` (desde ttyd) y forzar una corrida.
5. Con la barra abierta en el navegador (cloudcli-browser), verificar que los proyectos archivados desaparecen sin recargar. Tomar un snapshot antes y uno después.
6. E2E (b): archivar un proyecto de prueba, correr `orquestar.py crear zzz-e2e guia <ese dir>` y verificar que aparece en la barra en menos de 15 s sin recargar. Después `orquestar.py cerrar zzz-e2e-guia-1`.
7. E2E (a): `crear`, `cerrar` y volver a `crear` el mismo nombre. Comparar el sid de `orquestar.py listar --json` con el de la barra.
8. Actualizar `~/CLAUDE.md` (servicio `cloudcli`, una línea: «limpieza horaria, `LIMPIEZA_MODO`, log en `~/.cache/aos/limpieza.jsonl`»). Commit y push en `servidor-code`, `cloudcli` y `workspace-leandro`.

#### Estado (arranca todo en fail)
- [fail] El bundle es nuevo | valida: `ls -ld --time-style=+%s dist` posterior a `git log -1 --format=%ct`
- [fail] Leandro aprobó el simulado | valida: su respuesta en el chat
- [fail] La barra se achica en vivo | valida: snapshots del navegador antes y después
- [fail] E2E (b) en menos de 15 s | valida: snapshot del navegador
- [fail] E2E (a) con el sid correcto | valida: `orquestar.py listar --json` comparado con la barra
- [fail] Los tres repos están pusheados | valida: `git status -sb` sin `ahead`

#### Peligros
- El reinicio mata las sesiones del navegador; las de tmux sobreviven por `KillMode=process`.
- La primera corrida en `ejecutar` archiva mucho de una vez. Por eso se pasa por `simular` antes.

---

## Orden de ejecución

- Las **Fases 1 y 2** corren en paralelo (repos distintos).
- Después, las **Fases 3 y 4** corren en paralelo (dependen de la 2).
- La **Fase 5** espera a la 2, la 3 y la 4.
- La **Fase 6** va al final, con Leandro presente para el OK del simulado.
- La Fase 1 tiene que estar cerrada antes del E2E (a) de la Fase 6.

## Verificación final

Con la barra abierta y sin recargar:

1. `orquestar.py crear zzz-final guia /tmp/prueba-env`, en un proyecto que la limpieza archivó, aparece en menos de 15 s con su proyecto.
2. `tail -3 ~/.cache/aos/limpieza.jsonl` muestra corridas horarias en `ejecutar`.
3. La barra muestra Workspace Leandro (fijado) más, como máximo, los 3 proyectos con actividad interactiva más reciente.
4. `python3 ~/workspace-leandro/.claude/bin/sesiones.py listar --json` no tiene sids repetidos entre sesiones vivas.

## Riesgos globales

- **cloudcli no se archiva mientras su repo esté sucio** (ver la sugerencia 1). El plan funciona igual, pero cloudcli no va a salir de la barra hasta que se limpie el ruido.
- **La migración corre sobre la DB viva al arrancar.** Antes del deploy: `cp ~/.cloudcli/auth.db ~/.cloudcli/auth.db.bak-05oct`.
- **Dos procesos tocan `hibernadas.json`** (`ciclo.py` y la limpieza vía `orquestar.py`), sin candado. Es el mismo trato que ya acepta el sistema.

---

## Cambios realizados

- **Tests del server:** corren con `node:test` vía `tsx` (`NODE_ENV=test npx tsx --tsconfig server/tsconfig.json --test <archivo>`), no con vitest. Los `valida:` del server que dicen vitest están mal; vitest es solo para `src/`.
- **Fase 1, fuente nueva:** se agregó una fuente 0 para el sid de una sesión viva: `pane_pid → claude principal → ~/.claude/sessions/<pid>.json → sessionId`. Es exacta y gana sobre el hook y sobre el cwd. Cada entrada lleva `sid_fuente` (`proceso` / `hook` / `cwd`). La lógica del hook pasó a `sesiones.py hook` (testeable) y `registro-sesion.sh` quedó como envoltorio. Hay `flock` sobre `sesiones.json.lock` (sugerencia 2, incorporada). El filtro de transcripts excluye todo `sdk*` del respaldo por cwd. `hibernar.py` no se tocó. Mergeado a `master` de workspace-leandro (`968cf78`).
- **Fase 2:** `por` es obligatorio en las funciones de archivado. Por eso también se tocó `sessions.service.ts`, y los tipos `ArchivedBy`/`archived_*` van en `server/shared/types.ts` como opcionales. Hay 6 tests del server que ya fallaban en la base `c92c5dc1`, antes del plan: `shell-tmux.test.ts` (2) y `claude-cli-path.test.ts` (4).
- **Fase 3:** también se tocó `sessions-watcher.service.ts`: encola `reactivadas` además de `indexadas`, para que una fila que ya existía y solo se reactivó emita `session_upserted`. Una fila archivada con `archived_at` NULL (archivada antes de la migración) no se reactiva, así que la Fase 5 agrega un backfill (`archived_at` = momento de la migración). La reactivación por `.jsonl` solo aplica al provider claude.
- **Fase 4:** el productor nuevo está en `sidebar-archived-broadcast.service.ts`, exportado desde `websocket/index.ts`. Se agregó el caso `sidebar_archived` en `useChatRealtimeHandlers.ts`. Mergeada en `feat/limpieza-barra` (`d57a35fa`).
- **Fase 5:** al archivar un proyecto se archiva **solo la fila del proyecto**, no sus sesiones. Así «Restaurar» desde Archivados lo devuelve con todo adentro, igual que el archivado manual. Se archivan sesiones sueltas en dos casos: las `sdk-cli` terminadas y las interactivas inactivas de proyectos que se quedan. Hay un backfill de `archived_at` para lo archivado antes de la migración (cierra la falla b para esas filas). En `simular` no se puede anticipar un `dormir` rechazado por repo sucio o pregunta pendiente: eso solo aparece en `ejecutar`. Mergeado a `diseno/propio` (`36795114`).
- **Cambio piso → tope (5-oct, tarde):** `PISO_PROYECTOS` pasó a `TOPE_PROYECTOS` y el motivo de exento `piso` a `tope`. `seleccionarLimpieza` ya no filtra proyectos por 72 h: todo activo que no sea fijado, de la sesión fija o top 3 es candidato; `ejecutarLimpieza` no cambió. `exentos` del log ahora lista siempre los fijados y los 3 del tope, no solo los inactivos salvados. Leandro lo aplicó a mano ese día (quedaron Workspace Leandro, app-norte, app-optimum-main y cloudcli; archivó fiesta-music, estudio-video, app-optimum-mkt y optimum con `archived_by='orquestador'`). Tests: 22 en `limpieza.test.ts`.
- **Simulado sobre una copia de auth.db (5-oct 11:54Z, con la regla vieja de piso):** archivaría 6 proyectos (`/home/leantejado`, `worktrees/cloudcli/diseno-feedback-2`, `/tmp/prueba-prompt-tmux`, `/tmp/prueba-ask-tmux`, `/tmp/prueba-env`, `/tmp/prueba-e2e`) y 73 sesiones inactivas (~40 de `clientes/optimum`, ~17 de `/tmp`, 5 de `/tmp/spike-parciales`, 4 de cloudcli). No dormiría ni bloquearía nada. `entrypoint` todavía está en NULL en las filas viejas: las headless aparecen después de la primera sincronización completa del servicio nuevo. Línea completa: `scratchpad/f/limpieza.jsonl` de la sesión `cloudcli-limpieza-guia-1`.
- **Ruido de cloudcli (sugerencia 1):** se revirtió `package-lock.json` (re-resolución de npm, sin cambios en `package.json`) y `dist.old/` pasó a `.gitignore`.

---

## Continuación de Sesión

**Fases completadas:** 1, 2, 3, 4 y 5 (revalidadas por el orquestador). Fase 1 en `master` de workspace-leandro (`968cf78`); Fases 2 a 5 en `diseno/propio` (`36795114`), pusheadas.
**Fase actual:** Fase 6, que NO se ejecutó por decisión de Leandro: el deploy y el reinicio los decide él.
**Próximo paso exacto:** desde ttyd (`:10000`), no desde una terminal colgada de cloudcli: `cp ~/.cloudcli/auth.db ~/.cloudcli/auth.db.bak-05oct && cd ~/cloudcli && npm run build && systemctl --user restart cloudcli`, hard refresh, y a los 5 min `tail -1 ~/.cache/aos/limpieza.jsonl` (sigue en `simular`). Con el OK de Leandro sobre esa lista, el paso 4 de la Fase 6 (`LIMPIEZA_MODO=ejecutar`) y los E2E.
**Bloqueantes:** el gobernador estaba en rojo el 5-oct (pace 133%), así que `orquestar.py crear` no crea sesiones de prueba. La prueba en vivo del hook (Fase 1) y los E2E de la Fase 6 esperan a que baje. Hay que revisar si archivar ~40 sesiones de `clientes/optimum` y el proyecto `/home/leantejado` es lo que Leandro quiere.
**Micro-tasks pendientes:** 5 de 18 (las de la Fase 6 y fijar Workspace Leandro)
