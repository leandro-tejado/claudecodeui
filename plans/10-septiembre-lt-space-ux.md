# LT Space — título, confirmación de borrado, archivados y selector de IA

**Fecha:** 10 de Septiembre 2026
**Estado:** en-ejecucion

Renombra la interfaz a "LT Space" (título de pestaña + ícono), agrega confirmación antes de archivar un proyecto/sesión, expone una vista para ver y restaurar lo archivado, y limita el selector de asistente de IA a Claude (con elección de modelo). Todo sobre el componente real que se usa hoy (`SkinSidebar`), no sobre el sidebar viejo sin usar.

---

## Contexto

El sidebar visible en producción es `SkinSidebar.tsx` (importado como `Sidebar` en `ProjectSidebarRegion.tsx`). El componente `src/modules/sidebar/Sidebar.tsx` + `SidebarModals.tsx` — que sí tiene modal de confirmación y vista de archivados — **no se renderiza en ningún lado**: es código muerto. Por eso hoy click en el tacho de `SkinSidebar` llama directo a `onProjectDelete`/`onSessionDelete`, que hacen soft-delete (`api.deleteProject(id, false)` / `api.deleteSession(id, false)`) sin ningún paso intermedio. El backend ya soporta todo lo necesario (archivar, listar archivados, restaurar); falta la capa de UI en `SkinSidebar`.

**Repo en uso concurrente:** hay otra sesión trabajando ahora mismo sobre `/home/leantejado/cloudcli` (cambios sin commitear en `package.json`, `SidebarProjectSessions.tsx`, `ActivityIndicator.tsx`, archivos nuevos `ShiningText.tsx`/`ReorderList.tsx`, un `tsc --noEmit` corriendo). Ninguno de esos archivos se toca en este plan. Antes de cada fase, correr `git status --short` para confirmar que la lista de "no tocar" sigue igual.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `index.html` | modificar — `<title>`, `apple-mobile-web-app-title`, favicon links |
| `public/manifest.json` | modificar — `name`/`short_name` a "LT Space" |
| `public/favicon.svg` | reemplazar — diseño cuadrado "LT" (mismo estilo que el badge de `SkinSidebar.tsx:307`) |
| `public/generate-icons.js` | modificar — template del ícono para generar el set PWA con el nuevo diseño |
| `public/favicon.png`, `public/icons/icon-*.png` | regenerar — correr el script de generación |
| `src/shared/utils.ts` | modificar — `DEFAULT_PAGE_TITLE` (línea 197) |
| `src/modules/chat/utils/pageTitleNotification.ts` | modificar — fallback `'CloudCLI UI'` (línea ~93) |
| `src/modules/skin/SkinSidebar.tsx` | modificar — modal de confirmación al archivar + botón/vista de archivados |
| `src/modules/chat/transcript/ProviderSelectionEmptyState.tsx` | modificar — `PROVIDER_META` (línea 29-34) solo Claude |
| `src/modules/chat/modals/ModelLibraryPanel.tsx` | modificar — `PROVIDERS` (línea 21-26) solo Claude |

---

## Micro-tasks

- [x] Cambiar `<title>` en `index.html:8` a "LT Space" — acepta: pestaña del navegador muestra "LT Space" | valida: abrir la app y mirar la pestaña
- [x] Cambiar `apple-mobile-web-app-title` en `index.html:24` a "LT Space" — acepta: meta tag actualizado | valida: `grep apple-mobile-web-app-title index.html`
- [x] Cambiar `name`/`short_name` en `public/manifest.json` a "LT Space" — acepta: JSON válido con ambos campos actualizados | valida: `cat public/manifest.json`
- [x] Diseñar `public/favicon.svg` nuevo: cuadrado con esquinas redondeadas, fondo oscuro, texto "LT" en negrita/blanco (mismo lenguaje visual que el badge de `SkinSidebar.tsx:307-309`) — acepta: SVG válido, se ve bien en 16x16 y 32x32 | valida: abrir el SVG en el navegador a distintos zoom
- [x] Adaptar el template de `public/generate-icons.js` al nuevo diseño LT y correrlo para regenerar `public/icons/icon-*.png` y `public/favicon.png` — acepta: todos los tamaños (72 a 512) regenerados con el diseño nuevo | valida: `node public/generate-icons.js && ls -la public/icons/`
- [x] Cambiar `DEFAULT_PAGE_TITLE` en `src/shared/utils.ts:197` a `'LT Space'` — acepta: constante actualizada | valida: `grep DEFAULT_PAGE_TITLE src/shared/utils.ts`
- [x] Cambiar el fallback `'CloudCLI UI'` en `src/modules/chat/utils/pageTitleNotification.ts` a `'LT Space'` — acepta: string actualizado | valida: `grep "LT Space" src/modules/chat/utils/pageTitleNotification.ts`
- [x] Agregar estado `pendingArchive` (proyecto o sesión) en `SkinSidebar.tsx` que se setea al click del tacho en vez de llamar `onProjectDelete`/`onSessionDelete` directo — acepta: click en tacho no archiva nada todavía, solo abre modal | valida: click manual en la UI
- [x] Renderizar modal `Dialog` (reusar `@/shared/ui`) con texto "¿Archivar [nombre del proyecto/sesión]?" y botones Cancelar/Confirmar — acepta: modal se ve, Cancelar cierra sin archivar | valida: click manual
- [x] Conectar el botón Confirmar del modal a `onProjectDelete`/`onSessionDelete` (los mismos handlers de hoy, sin cambiar el backend) — acepta: solo tras Confirmar el proyecto/sesión desaparece de la lista activa | valida: click manual + `curl` a `/api/projects` para ver que `isArchived=1`
- [x] Agregar botón "Ver archivados" en el header de `SkinSidebar.tsx` (junto al botón de Buscar, línea ~318) que activa un modo de vista archivados — acepta: botón visible con tooltip | valida: inspección visual
- [x] Crear vista de archivados (nuevo componente o bloque condicional en `SkinSidebar.tsx`) que liste `api.archivedProjects()` y `api.getArchivedSessions()` — acepta: lista muestra proyectos y sesiones archivados con nombre | valida: archivar algo de prueba y verlo aparecer en la lista
- [x] Agregar botón "Restaurar" por ítem que llame `api.restoreProject(id)` / `api.restoreSession(id)` — acepta: tras restaurar, el ítem vuelve a la lista activa y desaparece de archivados | valida: click manual
- [x] Agregar botón "Volver" en la vista de archivados para salir al modo normal del sidebar — acepta: vuelve a la lista de proyectos activos | valida: click manual
- [x] En `ProviderSelectionEmptyState.tsx:29-34`, reducir `PROVIDER_META` a solo `{ id: 'claude', name: 'Anthropic' }` — acepta: el picker "Choose a model" muestra solo el grupo Claude, sin Cursor/OpenAI/OpenCode | valida: abrir sesión nueva, click en el selector
- [x] En `ModelLibraryPanel.tsx:21-26`, reducir `PROVIDERS` a solo `{ id: 'claude', label: 'Claude' }` — acepta: "Manage models" / "Add model" solo lista Claude | valida: abrir "Add model" desde el picker
- [x] Verificar que sigue siendo posible elegir entre modelos Claude (Sonnet/Opus/Haiku) tras el filtro — acepta: el dropdown de modelos Claude sigue completo | valida: abrir el picker y contar los modelos listados antes/después del cambio
- [x] Correr `npx tsc --noEmit` completo tras todos los cambios (coordinando con la sesión que está corriendo el suyo, no en simultáneo) — acepta: 0 errores nuevos atribuibles a estos cambios | valida: `npx tsc --noEmit -p tsconfig.json`
- [~] Probar el flujo completo en el navegador: título de pestaña, archivar con confirmación, ver y restaurar archivados, selector de IA solo-Claude — acepta: los 4 puntos funcionan sin errores de consola | valida: sesión manual en `https://leandro-servidor.taila8c262.ts.net:8443`

---

## Análisis Crítico

### Incongruencias detectadas
- El código legacy (`src/modules/sidebar/Sidebar.tsx`, `SidebarModals.tsx`, `SidebarContent.tsx`) ya resuelve exactamente esto (confirmación + archivados) pero para un componente que no se usa. No lo vamos a importar ni reactivar — sería reintroducir un sidebar paralelo — pero sirve como referencia de patrón UX/código al implementar en `SkinSidebar`.

### Huecos no cubiertos
- El paso de onboarding `src/modules/onboarding/AgentConnectionsStep.tsx` sigue ofreciendo conectar Cursor/Codex/OpenCode — el plan no lo toca porque el usuario solo mencionó la pantalla de selección de asistente al escribir un mensaje, no el onboarding inicial. Si también molesta, es una fase aparte.
- No se cubre eliminar sesiones/proyectos con `force=true` (borrado permanente real) desde la UI — hoy `SkinSidebar` nunca lo expone, y no se pidió agregarlo. Con la vista de archivados alcanza para "deshacer" un archivado por error.

### Áreas relacionadas a monitorear
- `src/shared/selectedProvider.ts` (persiste el proveedor elegido en localStorage) — no debería verse afectado porque el default ya es `'claude'`, pero si alguien tiene otro proveedor guardado de una sesión anterior, confirmar que no rompe al no encontrarlo en la lista filtrada.
- El proceso node en producción (`dist-server/server/index.js`, pid activo) sirve el build compilado — los cambios de frontend no se ven hasta correr `npm run build` (o el proceso de deploy que uses) y reiniciar/recargar. Confirmar cuál es el comando de build de este repo antes de dar por probado el resultado.

### Zonas intocables
- `package.json`, `src/modules/sidebar/SidebarProjectSessions.tsx`, `src/modules/chat/composer/ActivityIndicator.tsx`, `ShiningText.tsx`, `ReorderList.tsx` — en edición por otra sesión ahora mismo. No tocar bajo ningún punto de este plan.
- Backend de proyectos/sesiones archivados (`server/modules/projects/`) — ya funciona correctamente, este plan es 100% frontend.

### Sugerencias opcionales
- [ ] Aplicar el mismo modal de confirmación al borrado de sesión "Eliminar todos los datos" si en el futuro se agrega esa opción a la UI (hoy no existe en `SkinSidebar`, solo archivar). Esfuerzo bajo, no incluido porque no fue pedido.

---

## Fases

### Fase 1 - Título "LT Space" + ícono
**Goal (done-criterion):** La pestaña del navegador muestra "LT Space" Y `public/manifest.json` tiene `name`/`short_name` = "LT Space" Y `public/favicon.svg` muestra el diseño cuadrado "LT" Y `public/icons/*.png` están regenerados con ese diseño.
**Alcance:** Tocar: `index.html`, `public/manifest.json`, `public/favicon.svg`, `public/generate-icons.js`, `public/icons/`, `public/favicon.png`, `src/shared/utils.ts`, `src/modules/chat/utils/pageTitleNotification.ts`. Ignorar: todo lo demás de `public/` (logo.svg de auth, sw.js).
**Paralelizable:** Sí — no comparte archivos con las otras fases.

#### Pasos
1. Editar `index.html` (title, apple-mobile-web-app-title).
2. Editar `public/manifest.json` (name, short_name).
3. Diseñar el nuevo `public/favicon.svg` con el estilo del badge "LT" existente.
4. Adaptar `public/generate-icons.js` y correrlo para regenerar el set de íconos PWA.
5. Editar `DEFAULT_PAGE_TITLE` en `src/shared/utils.ts`.
6. Editar el fallback en `pageTitleNotification.ts`.

#### Estado (arranca todo en fail)
- [pass] `<title>` = "LT Space" | valida: `grep "<title>LT Space" index.html`
- [pass] manifest actualizado | valida: `grep "LT Space" public/manifest.json`
- [pass] favicon nuevo aplicado (badge "LT" sobre `hsl(240 5.9% 10%)`, mismo estilo que `SkinSidebar.tsx:307-309`) | valida: inspección visual del SVG
- [pass] íconos PWA regenerados — de paso se corrigió que todos los PNG eran copias de 512px mal nombradas; ahora cada tamaño tiene su propio raster | valida: `file public/icons/icon-192x192.png` → `192 x 192`
- [pass] `DEFAULT_PAGE_TITLE` = 'LT Space' | valida: `grep "DEFAULT_PAGE_TITLE = 'LT Space'" src/shared/utils.ts`
- [pass] fallback de notificación actualizado | valida: `grep "LT Space" src/modules/chat/utils/pageTitleNotification.ts`

#### Peligros
- Los íconos PWA cacheados en el navegador/celular del usuario pueden tardar en actualizarse (service worker `sw.js` cachea assets). Puede necesitar borrar caché o desinstalar/reinstalar la PWA para ver el ícono nuevo.

#### Mejores prácticas
- Mantener el mismo lenguaje visual que el badge "LT" que ya existe en el sidebar (`SkinSidebar.tsx:307-309`) para que el favicon y el ícono in-app se sientan como el mismo diseño.

---

### Fase 2 - Confirmación antes de archivar (proyecto y sesión)
**Goal (done-criterion):** Click en el tacho de un proyecto o sesión en `SkinSidebar` abre un modal "¿Archivar [nombre]?" Y solo al click en "Confirmar" se ejecuta el archivado real (`isArchived=1` en la DB) Y "Cancelar" cierra sin ningún efecto.
**Alcance:** Tocar: `src/modules/skin/SkinSidebar.tsx` únicamente (usar componentes `Dialog`/`Button` de `@/shared/ui`, ya importados en otras partes del proyecto). Ignorar: `src/modules/sidebar/` (código legacy, no reactivar), backend.
**Paralelizable con:** Fase 1 y Fase 4 (archivos distintos). No paralelizable con Fase 3 (mismo archivo `SkinSidebar.tsx`) — hacerla antes.

#### Pasos
1. Agregar estado local `pendingArchive: { kind: 'project' | 'session'; id: string; name: string } | null`.
2. Cambiar el `onClick` del tacho de proyecto (línea ~429-432) y de sesión (línea ~548) para que seteen `pendingArchive` en vez de llamar `onProjectDelete`/`onSessionDelete` directo.
3. Renderizar el modal `Dialog` condicionado a `pendingArchive !== null`.
4. Botón Confirmar → ejecuta el handler original con el id guardado, luego limpia `pendingArchive`.
5. Botón Cancelar → solo limpia `pendingArchive`.

#### Estado (arranca todo en fail)
- [pass] el tacho ya no llama a `onProjectDelete`: setea `pendingArchive` y abre el modal | valida: `grep -n "setPendingArchive" src/modules/skin/SkinSidebar.tsx` → 2 llamadas (proyecto y sesión), 0 llamadas directas a los handlers desde los tachos
- [pass] Cancelar sólo limpia el estado, no toca la API | valida: lectura del handler `onClick={() => setPendingArchive(null)}`
- [pass] Confirmar ejecuta el handler original con el id guardado | valida: `confirmArchive` en el archivo; strings presentes en el bundle compilado (`grep "se restaura desde Archivados" dist/assets/index-*.js`)
- [pass] el mismo flujo cubre sesiones (tacho de sesión → `kind: 'session'`) | valida: lectura del `onClick` de la fila de sesión
- [pend] click-through real en el navegador | **pendiente del usuario**: no hay navegador headless en esta máquina y la API pide auth (401 sin token)

#### Peligros
- No confundir el estado `pendingArchive` con el `isArchived` que ya usa `pendingDeletion.isArchived` en el código legacy — es un nombre nuevo, sin relación.
- Revisar que `event.stopPropagation()` se mantenga en el onClick del tacho para no disparar la selección del proyecto al abrir el modal.

#### Mejores prácticas
- Reusar `Dialog`/`DialogContent`/`DialogTitle`/`Button` de `@/shared/ui` (mismo patrón que `ProviderSelectionEmptyState.tsx`) en vez de un `<div>` fijo con `ReactDOM.createPortal` como hace el modal legacy — es menos código y consistente con el resto de la UI actual.

---

### Fase 3 - Vista de archivados con restaurar
**Goal (done-criterion):** Existe un botón en el header de `SkinSidebar` que muestra una lista de proyectos y sesiones archivados (trayendo `api.archivedProjects()` y `api.getArchivedSessions()`) Y cada ítem tiene un botón "Restaurar" que lo saca de archivados y lo devuelve a la lista activa Y hay forma de volver a la vista normal.
**Alcance:** Tocar: `src/modules/skin/SkinSidebar.tsx` (o un componente nuevo `SkinArchivedView.tsx` importado ahí si el archivo queda muy largo). Ignorar: backend (ya expone todo lo necesario).
**Paralelizable con:** Fase 1 y Fase 4. Depende de que la Fase 2 esté aplicada primero (mismo archivo).

#### Pasos
1. Agregar botón "Ver archivados" en el header (cerca del botón Buscar, línea ~318 de `SkinSidebar.tsx`) con estado `viewMode: 'active' | 'archived'`.
2. Al activar `archived`, hacer fetch con `api.archivedProjects()` y `api.getArchivedSessions()`.
3. Renderizar la lista con nombre + botón "Restaurar".
4. "Restaurar" llama `api.restoreProject(id)` o `api.restoreSession(id)` según el tipo, y refresca la lista de archivados.
5. Botón "Volver" cambia `viewMode` a `'active'`.

#### Estado (arranca todo en fail)
- [pass] botón "Ver archivados" (ícono `Archive`) en la cabecera, con estado activo | valida: lectura del bloque de cabecera + `grep "Ver archivados" dist/assets/index-*.js`
- [pass] hay datos reales que mostrar: 4 proyectos y 11 sesiones archivadas en la DB | valida: `sqlite3` sobre `~/.cloudcli/auth.db` → `claudecodeui`, `agente-workspace`, `fiesta-music`, `app-norte`
- [pass] el parseo de la respuesta usa el mismo shape que el controlador de upstream (`data.projects` / `data.sessions`) | valida: comparación con `useSidebarController.ts:201-207`
- [pass] "Restaurar" llama `api.restoreProject` / `api.restoreSession` y refresca las dos listas | valida: lectura de `restoreArchived`
- [pass] "Volver" y el toggle de la cabecera regresan a la vista normal | valida: lectura de los dos handlers
- [pend] click-through real en el navegador | **pendiente del usuario**, misma razón que en Fase 2

#### Peligros
- `api.archivedProjects()` y `api.getArchivedSessions()` son dos llamadas separadas a endpoints distintos — verificar la forma exacta de la respuesta de cada uno (puede que un proyecto archivado no traiga sus sesiones anidadas, a diferencia de `ArchivedProjectListItem` que sí lo hacía en el código legacy). Revisar el shape real antes de asumir la misma estructura.

#### Mejores prácticas
- No reactivar ni importar `SidebarContent.tsx` — es más simple escribir una vista nueva y chica en el estilo de `SkinSidebar` que adaptar un componente pensado para otro layout.

---

### Fase 4 - Selector de IA limitado a Claude
**Goal (done-criterion):** El picker "Choose a model" en una sesión nueva muestra únicamente el grupo Claude (sin Cursor/OpenAI/OpenCode) Y el panel "Manage models" / "Add model" también muestra solo Claude Y sigue siendo posible elegir entre los modelos Claude disponibles (Sonnet/Opus/Haiku).
**Alcance:** Tocar: `src/modules/chat/transcript/ProviderSelectionEmptyState.tsx` (`PROVIDER_META`), `src/modules/chat/modals/ModelLibraryPanel.tsx` (`PROVIDERS`). Ignorar: `src/modules/onboarding/AgentConnectionsStep.tsx` (fuera de scope, ver Análisis Crítico), `src/shared/types.ts` (el tipo `LLMProvider` no se toca, solo se filtran los arrays de UI).
**Paralelizable con:** Fase 1, Fase 2 y Fase 3 (archivos distintos).

#### Pasos
1. En `ProviderSelectionEmptyState.tsx:29-34`, dejar `PROVIDER_META` con un solo elemento (`claude`).
2. En `ModelLibraryPanel.tsx:21-26`, dejar `PROVIDERS` con un solo elemento (`claude`).
3. Revisar visualmente que el picker y el panel de manage models no muestren un selector de proveedor vacío o roto al tener un solo grupo.

#### Estado (arranca todo en fail)
- [pass] `PROVIDER_META` quedó con un solo elemento (`claude`) | valida: `grep -A3 "PROVIDER_META" src/modules/chat/transcript/ProviderSelectionEmptyState.tsx`
- [pass] `PROVIDERS` de ModelLibraryPanel quedó con un solo elemento, y la tira de pestañas se oculta cuando hay uno solo | valida: `grep -n "PROVIDERS.length > 1" src/modules/chat/modals/ModelLibraryPanel.tsx`
- [pass] los modelos de Claude siguen saliendo del catálogo sin tocar (`providerModelCatalog['claude'].OPTIONS`) | valida: el filtro es sobre el array de proveedores de UI, no sobre el catálogo
- [pend] confirmación visual del picker en el navegador | **pendiente del usuario**

#### Peligros
- Si `providerModelCatalog` u otro estado global asume siempre 4 proveedores en algún cálculo (paddings, índices), verificar que no rompa con un array de 1. Baja probabilidad pero revisar al probar.

#### Mejores prácticas
- No borrar el tipo `LLMProvider` completo del sistema (`'claude' | 'cursor' | 'codex' | 'opencode'`) ni las funciones que lo soportan — solo se filtra qué se muestra en estos dos arrays de UI. Mantener el resto intacto evita romper el backend/auth de esos proveedores si algún día se reactivan.

---

## Orden de ejecución

Fase 1 y Fase 4 pueden correr en paralelo con cualquier otra (archivos independientes). Fase 2 y Fase 3 comparten `SkinSidebar.tsx`: Fase 2 va primero, Fase 3 después (secuencial entre ellas). Orden sugerido: **Fase 1 → Fase 2 → Fase 3**, con **Fase 4** en paralelo a cualquiera de las tres.

## Verificación final

1. `npx tsc --noEmit -p tsconfig.json` sin errores nuevos.
2. Build de producción (`npm run build`, confirmar el script exacto en `package.json` antes de correrlo) y reinicio del proceso que sirve `dist-server/` para ver los cambios reflejados.
3. Sesión manual en `https://leandro-servidor.taila8c262.ts.net:8443` cubriendo los 4 puntos: título de pestaña, archivar con confirmación, ver+restaurar archivados, selector de IA solo-Claude.

## Riesgos globales

- Trabajar sobre un repo con otra sesión activa: mitigado limitando el scope a archivos que esa sesión no toca, y revisando `git status --short` antes de cada fase.
- No se conoce todavía el comando exacto de build/deploy de este fork — confirmar antes de la Fase de verificación final (revisar `package.json` scripts y cómo se reinicia `dist-server/server/index.js` en este VPS).

---

## Cambios realizados

**Fase 1 — título e ícono.** Además de lo planificado, se corrigió un bug preexistente: los ocho PNG de `public/icons/` eran copias byte a byte de la misma imagen de 512px con nombres distintos. `generate-icons.js` se reescribió a ESM (el repo es `"type": "module"`, así que el `require()` original nunca podía correr) y ahora rasteriza cada tamaño con `sharp`.

**Fase 2 — confirmación.** Se usó `Dialog` de `@/shared/ui` en vez del patrón `createPortal` a mano del modal legacy. El botón *Cancelar* va primero en el DOM a propósito: `DialogContent` enfoca el primer elemento focusable al abrir, y ese foco no puede caer sobre el botón que archiva. De paso, el tooltip del tacho de sesión decía "Borrar sesión" cuando lo que hace es archivar — corregido a "Archivar sesión".

**Fase 3 — archivados.** La carga se dispara en el `onClick` que entra al modo archivados, no en un `useEffect`. La primera versión usaba un efecto y `oxlint` marcó `set-state-in-effect`; atarlo al gesto que lo causa saca el warning y un render de más. Se replicó de upstream el filtro que descarta las sesiones cuyo proyecto ya está archivado: viajan con el proyecto y se listarían dos veces.

**Fase 4 — selector.** Además de reducir los dos arrays, la tira de pestañas de proveedor de `ModelLibraryPanel` se oculta cuando hay uno solo: una pestaña única no elige nada. El tipo `LLMProvider` y el soporte de backend quedan intactos.

**Verificación.** `tsc --noEmit` en 0 errores, `oxlint` sin warnings nuevos en los módulos tocados (los 2 que aparecen son baseline del repo: hay 74 iguales). `npm run build:client` OK y el servidor ya sirve el resultado sin reiniciar, porque `server/index.ts:203-207` usa `express.static` contra `public/` y `dist/` — se verificó por HTTP: `<title>LT Space</title>`, `manifest.json` con el nombre nuevo y `favicon.png` 200. **No se reinició el proceso** (pid 133661): habría cortado la sesión desde la que se está trabajando, y no hacía falta.

---

## Continuación de Sesión

**Fases completadas:** las cuatro, a nivel código, build y servido por HTTP.
**Fase actual:** pendiente la verificación en navegador (única tarea abierta).
**Próximo paso exacto:** recargar `https://leandro-servidor.taila8c262.ts.net:8443` con caché forzada (Ctrl+Shift+R) y comprobar: (1) pestaña "LT Space" + ícono LT, (2) el tacho abre modal y Cancelar no archiva, (3) el ícono de archivo en la cabecera lista los 4 proyectos y 11 sesiones archivadas, y Restaurar los devuelve, (4) el picker de modelo muestra sólo Claude.
**Bloqueantes:** ninguno. El favicon puede tardar en cambiar por el service worker (`sw.js` cachea assets): si sigue viejo, recarga forzada o desinstalar/reinstalar la PWA.
**Micro-tasks pendientes:** 1 de 19 (la verificación en navegador).
