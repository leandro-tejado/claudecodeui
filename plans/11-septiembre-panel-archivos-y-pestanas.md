# Panel de archivos al lado del chat + sesiones en pestañas nuevas

**Fecha:** 11 de Septiembre 2026
**Estado:** en-ejecucion

Convierte la vista de archivos en una columna lateral derecha permanente —visible mientras escribís en el chat— y devuelve a las filas de sesión del sidebar el `href` que el rediseño propio les sacó, para que la rueda del ratón abra la sesión en una pestaña nueva.

---

## Contexto

Dos fricciones de la consola, con causas distintas:

1. **Archivos y chat son excluyentes.** El botón Archivos hace `setActiveTab('files')` y `WorkspaceMain.tsx:160` monta el `FileTree` *en lugar* del chat. No hay forma de ver el árbol mientras el agente trabaja. El borde derecho está ocupado por el drawer de Ajustes rápidos, que no se usa.
2. **La rueda del ratón no abre nada.** El sidebar de upstream (`src/modules/sidebar/SidebarSessionItem.tsx:295`) ya resuelve esto con un `<a href="/session/:id">` y un `onClick` que hace `preventDefault` sólo cuando no hay modificadores. Pero **ese sidebar no se renderiza**: `ProjectSidebarRegion.tsx:8` importa `SkinSidebar`, el rediseño propio, y ahí la fila es un `<div onClick>` sin `href` (`SkinSidebar.tsx:641`). Sin `href` no hay middle-click, ni Ctrl+click, ni "abrir en pestaña nueva" del menú contextual. No es una feature nueva: es una que se perdió en el injerto.

La ruta `/session/:sessionId` ya existe (`App.tsx:128`) y resuelve la sesión contra la API aunque se entre en frío, así que una pestaña nueva abre la sesión sin más trabajo de backend.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `src/modules/skin/SkinSidebar.tsx` | modificar — fila de sesión (~641) pasa a `<a href>`; los botones de renombrar/archivar salen del ancla |
| `src/modules/skin/skinUiStore.ts` | modificar — sumar `filesPanelOpen` y `filesPanelWidth` persistidos |
| `src/modules/skin/SkinFilesPanel.tsx` | crear — columna derecha redimensionable que hospeda el `FileTree` |
| `src/modules/skin/SkinHeader.tsx` | modificar — `files` sale de `BASE_TABS` y pasa a ser un botón que abre/cierra el panel |
| `src/modules/skin/index.ts` | modificar — exportar `SkinFilesPanel` y las acciones nuevas del store |
| `src/modules/project-workspace/WorkspaceMain.tsx` | modificar — montar el panel, retirar el bloque `activeTab === 'files'`, redirigir `openFile` |
| `src/modules/project-workspace/ProjectWorkspaceShell.tsx` | modificar — dejar de montar `<QuickSettingsPanel />` |
| `src/modules/settings/tabs/AppearanceSettingsTab.tsx` | modificar — sección nueva con los tres toggles huérfanos |
| `src/modules/file-tree/FileTree.tsx` | modificar — dos props opcionales: `compact` y `refreshSignal` |
| `src/modules/file-tree/FileTreeHeader.tsx` | modificar — ocultar el switch lista/tabla cuando es compacto |
| `src/modules/skin/hooks/useFilesPanelRoom.ts` | crear — umbrales de ancho para replegar el panel sin tocar la preferencia |
| `src/modules/skin/hooks/useRunningTabTitle.ts` | crear — prefijo `●` en el título mientras corre la sesión de esta pestaña |
| `src/modules/skin/tests/skinSessionRow.test.tsx` | crear — el `href` existe y el click con modificador no navega en la app |

**Zona de merge:** todo lo propio vive en `src/modules/skin/`. Los cuatro archivos de upstream que se tocan reciben injertos de pocas líneas, nunca reescrituras.

---

## Micro-tasks

- [x] Leer `useHref` una sola vez en `SkinSidebar` (`const sessionHrefBase = useHref('/session')`) — acepta: una única llamada a hook, fuera de cualquier `map` — valida: `grep -c "useHref" src/modules/skin/SkinSidebar.tsx` devuelve 2 (import + uso)
- [x] Reestructurar la fila de sesión: wrapper `div.group.relative` → `<a>` con el contenido + botones como hermanos absolutos — acepta: ningún `<button>` queda dentro del `<a>` — valida: revisión del JSX + `npm run test:client`
- [x] `onClick` de la fila: `if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;` antes del `preventDefault()` — acepta: Ctrl+click abre pestaña nueva, click normal navega en la app — valida: prueba en el navegador
- [x] Mantener la rama `isRenaming` como `div` con el input, sin ancla — acepta: renombrar sigue funcionando y Enter guarda — valida: renombrar una sesión en el navegador
- [x] Escribir `src/modules/skin/tests/skinSessionRow.test.tsx` con `MemoryRouter` — acepta: assert de `href` = `/session/<id>` y de que `onSessionSelect` no se llama con `ctrlKey` — valida: `npm run test:client`
- [x] Agregar sección "Chat" a `AppearanceSettingsTab` con los tres `SettingsToggle` (`showThinking`, `showRawParameters`, `sendByCtrlEnter`) leyendo `useUiPreferences`/`useSetUiPreference` — acepta: los tres aparecen en Ajustes → Apariencia y persisten al recargar — valida: cambiar uno, recargar, verificar
- [x] Quitar `<QuickSettingsPanel />` y su import de `ProjectWorkspaceShell.tsx` — acepta: la manija flotante del borde derecho ya no aparece — valida: `grep -n QuickSettings src/modules/project-workspace/ProjectWorkspaceShell.tsx` sin resultados
- [x] Extender `skinUiStore` con `filesPanelOpen` (clave `skin:files-panel-open`) y `filesPanelWidth` (clave `skin:files-panel-width`, default 320, rango 240–640) — acepta: ambos sobreviven a un reload — valida: `localStorage.getItem('skin:files-panel-open')` en la consola del navegador
- [x] Exportar `toggleFilesPanel` y `setFilesPanelWidth` desde `skinUiStore` y el barrel `skin/index.ts` — acepta: importables como `@/modules/skin` — valida: `npm run typecheck`
- [x] Crear `SkinFilesPanel.tsx`: contenedor `flex-none` con ancho del store, manija de arrastre a la izquierda, cabecera con nombre del proyecto y botón cerrar — acepta: se arrastra y el ancho persiste — valida: arrastrar, recargar, comprobar
- [x] Agregar `compact?: boolean` a `FileTree`: fuerza `viewMode = 'list'` y pasa la señal al header — acepta: el panel angosto nunca muestra la tabla de columnas — valida: abrir el panel con el modo tabla previamente guardado
- [x] Agregar `refreshSignal?: number` a `FileTree` con un `useEffect` que llame `refreshFiles` al cambiar — acepta: incrementar la señal recarga el árbol sin perder carpetas expandidas — valida: crear un archivo por chat y ver si aparece sin colapsar el árbol
- [x] Ocultar el switch lista/tabla en `FileTreeHeader` cuando `compact` — acepta: la barra del panel entra sin desbordar a 320px — valida: inspección visual
- [x] Montar `<SkinFilesPanel />` en `WorkspaceMain`, como hermano de `EditorSidebar` dentro del `flex` principal — acepta: orden chat → editor → archivos — valida: abrir un archivo con el panel abierto
- [x] Borrar el bloque `{activeTab === 'files' && <FileTree …/>}` de `WorkspaceMain` y dejar `fillSpace={false}` en `EditorSidebar` — acepta: no queda ninguna referencia a la tab files — valida: `grep -n "'files'" src/modules/project-workspace/WorkspaceMain.tsx`
- [x] Agregar el efecto defensivo `if (activeTab === 'files') setActiveTab('chat')` — acepta: una sesión que venía con la tab files no queda en pantalla vacía — valida: forzar `activeTab='files'` y comprobar que vuelve a chat
- [x] Redirigir `openFile` de la paleta de comandos: abrir el panel + `handleFileOpen` en vez de `setActiveTab('files')` — acepta: buscar un archivo en la paleta lo abre en el editor lateral — valida: Cmd+K → archivo
- [x] Sacar `files` de `BASE_TABS` en `SkinHeader` y agregar el botón Folder con `onClick={toggleFilesPanel}` y `aria-pressed` — acepta: el botón queda marcado mientras el panel está abierto — valida: inspección visual
- [x] Quitar la rama `activeTab === 'files'` del cálculo del título en `SkinHeader` — acepta: el título sigue mostrando la sesión con el panel abierto — valida: abrir el panel y mirar la cabecera
- [x] Auto-refresco: en `SkinFilesPanel`, con `useBusySessionIdSet()`, incrementar `refreshSignal` cuando la sesión activa sale del set — acepta: al terminar una respuesta que creó un archivo, el árbol lo muestra sin tocar nada — valida: pedirle al agente que cree un archivo y mirar el panel
- [x] Crear `useFilesPanelRoom.ts` en `skin` con dos `matchMedia` (`min-width: 1400px` y `min-width: 1100px`) — acepta: sin listeners de `resize`, un solo `MediaQueryList` por consulta — valida: `npm run test:client`
- [x] Ocultar el panel cuando no hay lugar **sin tocar** `filesPanelOpen` — acepta: achicar la ventana lo repliega, agrandarla lo devuelve, la preferencia guardada no cambia — valida: achicar, agrandar, mirar `localStorage`
- [x] Crear `useRunningTabTitle.ts` en `skin`: prefijo `● ` en `document.title` mientras la sesión de **esta** pestaña esté corriendo — acepta: sólo se marca la pestaña cuya sesión corre, no todas — valida: dos pestañas con sesiones distintas, una corriendo
- [x] Convivencia con el indicador `[Done]` de `pageTitleNotification.ts` — acepta: ninguno de los dos deja basura en el título al limpiarse — valida: dejar terminar una respuesta en segundo plano y mirar la pestaña
- [x] Correr `npm run lint`, `npm run typecheck`, `npm run test:client` y `npm run build:client` — acepta: los cuatro en verde — valida: los cuatro comandos
- [ ] Recargar duro `:8443` (Ctrl+Shift+R por el service worker) y verificar las dos funcionalidades — acepta: chat + archivos a la vez, y rueda del ratón abriendo pestaña — valida: prueba manual de Leandro
- [ ] Commit y push en `diseno/propio` — acepta: `git status` limpio y rama pusheada — valida: `git log origin/diseno/propio -1`

---

## Análisis Crítico

> Completado en Fase 2.5. Leandro decide qué incorporar antes de ejecutar.

### Incongruencias detectadas

- **"Eliminar Ajustes rápidos" tiene dos lecturas y elegí la barata.** El módulo `src/modules/quick-settings-panel/` **no se borra del árbol**: sólo se deja de montar. Borrar un módulo de upstream genera conflicto en cada `git merge upstream/main` futuro, y el repo ya tiene el precedente opuesto — `src/modules/sidebar/` quedó como código muerto por esta misma razón (plan del 10-sep). Para el usuario el panel desaparece; para el árbol queda un archivo sin consumidores. Si preferís la limpieza total, se hace, pero se paga en cada merge.
- **La vista de tabla se va, pero el tipo `AppTab` conserva `'files'`.** Es de upstream y lo usan otros módulos; tocarlo sería una reescritura. De ahí el efecto defensivo que devuelve a `chat` si alguien llega con esa tab.

### Huecos no cubiertos

- **Tres columnas no entran en una pantalla chica.** A 1920px entra justo (345 sidebar + chat + 600 editor + 320 árbol = 1585 y sobra). Abajo de ~1400px el chat queda asfixiado. Resuelto en la **Fase 5**: el panel se oculta solo cuando no hay lugar, sin tocar la preferencia guardada.
- **Móvil.** El panel se monta sólo con `!isMobile`. En el teléfono el botón Archivos tiene que seguir haciendo lo de hoy, y eso obliga a **conservar** la rama de la tab en mobile. Lo resuelvo montando el `FileTree` a pantalla completa cuando `isMobile`, con la misma tab.
- **El árbol no sabe qué archivo tocó el agente.** Se refresca, pero no resalta ni revela lo nuevo. Va como sugerencia.
- **El refresco depende de que el WebSocket marque la sesión como idle.** Si una sesión queda colgada en "procesando" (pasó con el bug de sockets muertos del 10-sep), el auto-refresco no dispara. El botón manual sigue siendo la red de seguridad.

### Áreas relacionadas a monitorear

- `EditorSidebar` y su `useEditorSidebar`: el cálculo de ancho lee `resizeHandleRef.current.parentElement.parentElement` para medir el contenedor. Sumar una columna hermana **no** cambia esa cadena, pero sí cambia el ancho disponible: el `maxWidth = containerRect.width * 0.8` ahora compite con el panel.
- `usePaletteOpsRegister` en `WorkspaceMain`: `openFile` cambia de comportamiento y la paleta lo registra en un efecto; la función tiene que seguir siendo estable (`useCallback`) o se reescribe el registro en cada render.
- **Varias pestañas abiertas a la vez** — que es el objetivo del punto 2 — significa varios WebSockets autenticados con el mismo token. A vigilar: notificaciones del navegador duplicadas (una por pestaña) y el medidor de ventana de 5 h contando dos veces. Ninguna es bloqueante, las dos son molestas.
- El service worker cachea el bundle: después de cada build hay que recargar duro o la pestaña sigue con el JS viejo.

### Zonas intocables

- `src/modules/sidebar/**` — es código muerto, no se renderiza. No tocar ni "arreglar".
- `ChatInterface` y todo `src/modules/chat/` — el chat anda; este plan no lo toca.
- `useFileTreeData`, `useFileTreeOperations`, `useFileTreeUpload` — la lógica del árbol queda igual; los cambios en `FileTree` son dos props opcionales y nada más.
- El backend entero: no hay un solo cambio en `server/`.
- La rama `main` del fork: todo va a `diseno/propio`.

### Sugerencias opcionales

> Resueltas el 11-sep: Leandro aceptó las dos últimas, que pasaron a ser las **Fases 5 y 6**. Las dos primeras quedan descartadas.

- [ ] ~~**Resaltar lo que el agente acaba de tocar**~~ — descartada, no la necesita.
- [ ] ~~**Atajo de teclado para el panel**~~ — descartada, no la necesita.
- [x] **Auto-colapso por ancho de ventana** → **Fase 5**.
- [x] **Marcar la pestaña que tiene una sesión corriendo** → **Fase 6**.

---

## Fases

### Fase 1 — La rueda del ratón abre la sesión en una pestaña nueva

**Goal (done-criterion):** `src/modules/skin/SkinSidebar.tsx` renderiza cada sesión no-renombrándose como `<a href="/session/<id>">` con los botones de acción fuera del ancla, Y `src/modules/skin/tests/skinSessionRow.test.tsx` existe y pasa, Y `npm run test:client` y `npm run typecheck` terminan en verde.
**Alcance:** Tocar: `src/modules/skin/SkinSidebar.tsx`, `src/modules/skin/tests/`. Ignorar: `src/modules/sidebar/**` (código muerto), todo `server/`, el resto de `project-workspace`.
**Paralelizable:** Sí — no comparte archivos con ninguna otra fase.

#### Pasos
1. Importar `useHref` de `react-router-dom` y resolver `const sessionHrefBase = useHref('/session')` en el cuerpo de `SkinSidebar` (una sola vez: llamarlo dentro del `map` violaría las reglas de hooks).
2. En la fila (~641), reemplazar el `div onClick` por `<div className="group relative">` que contiene un `<a>` con el contenido de la fila y, como **hermano**, el bloque `absolute right-2` con los botones de renombrar/archivar.
3. En el `onClick` del `<a>`: salir temprano si `metaKey || ctrlKey || shiftKey || altKey`; si no, `preventDefault()` y `onSessionSelect(session)`.
4. Dejar la rama `isRenaming` como está hoy (div + input), sin ancla.
5. Escribir el test con `@testing-library/react` + `MemoryRouter`.

#### Estado (arranca todo en fail)
- [pass] la fila expone `href="/session/<id>"` | valida: `npm run test:client`
- [pass] ningún `<button>` anidado dentro del `<a>` | valida: revisión del JSX + el test no advierte anidamiento inválido
- [pass] click con `ctrlKey` no llama `onSessionSelect` | valida: `npm run test:client`
- [fail] click normal sigue navegando en la app sin recargar | valida: prueba en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] renombrar y archivar siguen funcionando | valida: prueba en el navegador — **pendiente: verificación de Leandro en el navegador**
- [pass] `npm run typecheck` y `npm run lint` en verde | valida: los dos comandos

#### Peligros
- Un `<button>` dentro de un `<a>` es HTML inválido: el navegador reacomoda el DOM y los handlers dejan de recibir el evento. Es el error natural de este cambio.
- El `href` sin `useHref` ignora el `basename` del router. Hoy la app se sirve en la raíz de `:8443` y funcionaría igual, pero rompería el día que se monte detrás de un prefijo.

#### Mejores prácticas
- El `href` es la fuente de verdad: middle-click, Ctrl+click, arrastrar el link y el menú contextual salen todos gratis del mismo atributo. No agregar un `onAuxClick` con `window.open` — duplica reglas y se desincroniza.
- `stopPropagation()` en los botones de acción, para que no disparen la navegación del ancla.

---

### Fase 2 — Ajustes rápidos: los toggles se mudan y el drawer se retira

**Goal (done-criterion):** `Ajustes → Apariencia` muestra los tres toggles (`showThinking`, `showRawParameters`, `sendByCtrlEnter`) y su valor sobrevive a un reload, Y `grep -n "QuickSettings" src/modules/project-workspace/ProjectWorkspaceShell.tsx` no devuelve nada, Y `npm run typecheck` en verde.
**Alcance:** Tocar: `src/modules/settings/tabs/AppearanceSettingsTab.tsx`, `src/modules/project-workspace/ProjectWorkspaceShell.tsx`. Ignorar: `src/modules/quick-settings-panel/**` (queda en el árbol, sin consumidores), el resto de `settings/tabs`.
**Paralelizable:** Sí — con Fase 1 y Fase 3.

#### Pasos
1. En `AppearanceSettingsTab`, agregar una `SettingsSection` titulada "Chat" con tres `SettingsRow` + `SettingsToggle`, leyendo `useUiPreferences()` y escribiendo con `useSetUiPreference()`. No pasa por props: el tab no necesita que el padre le pase nada.
2. Quitar `<QuickSettingsPanel />` y su `import` de `ProjectWorkspaceShell.tsx`.
3. Verificar con `grep -rn "quick-settings-panel" src/` que no queda ningún consumidor, y dejar constancia en un comentario de una línea en el archivo del módulo explicando que quedó desmontado a propósito.

#### Estado (arranca todo en fail)
- [fail] los tres toggles aparecen en Ajustes → Apariencia | valida: abrir Ajustes en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] desactivar "Mostrar razonamiento" y recargar lo mantiene desactivado | valida: prueba en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] la manija flotante del borde derecho ya no existe | valida: inspección visual — **pendiente: verificación de Leandro en el navegador**
- [pass] sin consumidores de `quick-settings-panel` | valida: `grep -rn "quick-settings-panel" src/ --include=*.tsx --include=*.ts`
- [pass] `npm run typecheck` y `npm run lint` en verde | valida: los dos comandos

#### Peligros
- Estos tres toggles **no existen en ningún otro lugar de la UI**: si se desmonta el drawer antes de moverlos, se pierde el control de "Mostrar razonamiento", que hoy está activado. El orden de los pasos importa.
- Los tipos `QuickSettingsPreferences` y `QuickSettingsHandleStyle` viven en `src/shared/types.ts`. No borrarlos: el módulo sigue compilando y son suyos.

#### Mejores prácticas
- Reutilizar `SettingsSection`/`SettingsCard`/`SettingsRow`/`SettingsToggle`, que es lo que usa el resto del tab. Nada de markup nuevo.
- Textos en español directo, como el resto del skin.

---

### Fase 3 — El panel de archivos como tercera columna

**Goal (done-criterion):** Con el panel abierto, el chat sigue visible y recibe texto, Y `skin:files-panel-open` y `skin:files-panel-width` existen en `localStorage` y se respetan tras recargar, Y `grep -n "activeTab === 'files'" src/modules/project-workspace/WorkspaceMain.tsx` no devuelve nada en la rama de escritorio, Y `npm run build:client` termina sin errores.
**Alcance:** Tocar: `src/modules/skin/skinUiStore.ts`, `src/modules/skin/SkinFilesPanel.tsx` (nuevo), `src/modules/skin/SkinHeader.tsx`, `src/modules/skin/index.ts`, `src/modules/project-workspace/WorkspaceMain.tsx`, `src/modules/file-tree/FileTree.tsx`, `src/modules/file-tree/FileTreeHeader.tsx`. Ignorar: `server/`, `src/modules/chat/**`, `src/modules/git-panel/**`, los hooks de datos del file-tree.
**Paralelizable:** Sí con Fase 1 y 2 — No con Fase 4, que depende de ésta.

#### Pasos
1. `skinUiStore`: sumar `filesPanelOpen: boolean` y `filesPanelWidth: number` al estado, con sus claves de `localStorage` y las acciones `toggleFilesPanel` / `setFilesPanelWidth` (clamp 240–640, default 320). Mantener el patrón de snapshot estable que ya usa el store.
2. Crear `SkinFilesPanel.tsx`: `flex-none` con `style={{ width }}`, borde izquierdo que funciona como manija de arrastre (mismo patrón que la manija del `SkinSidebar`), cabecera con el nombre del proyecto, botón de refrescar y botón de cerrar, y dentro `<FileTree selectedProject={…} onFileOpen={…} compact />`.
3. `FileTree`: agregar `compact?: boolean` (fuerza `viewMode` a `'list'` y se lo pasa al header) y `refreshSignal?: number` (un `useEffect` que llama `refreshFiles` cuando cambia, ignorando el primer valor).
4. `FileTreeHeader`: con `compact`, no renderizar el switch lista/tabla.
5. `WorkspaceMain`: montar `<SkinFilesPanel />` como hermano de `EditorSidebar`; borrar el bloque `activeTab === 'files'` **de escritorio**, conservando el `FileTree` a pantalla completa cuando `isMobile`; `fillSpace={false}`; efecto defensivo que devuelve `activeTab` a `'chat'` si llega en `'files'` y no es móvil; `openFile` de la paleta abre el panel y el editor.
6. `SkinHeader`: sacar `files` de `BASE_TABS`, agregar el botón Folder con `onClick={toggleFilesPanel}`, `aria-pressed={filesPanelOpen}` y el mismo estilo activo que las tabs; sacar la rama `'files'` del título.

#### Estado (arranca todo en fail)
- [fail] con el panel abierto se ve el chat y se puede escribir | valida: prueba en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] el botón Folder abre y cierra el panel, y queda marcado mientras está abierto | valida: prueba en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] el ancho se arrastra y sobrevive al reload | valida: arrastrar, `Ctrl+Shift+R`, comprobar — **pendiente: verificación de Leandro en el navegador**
- [fail] abierto/cerrado sobrevive al reload | valida: `localStorage.getItem('skin:files-panel-open')` — **pendiente: verificación de Leandro en el navegador**
- [fail] clic en un archivo lo abre en el editor lateral, con las tres columnas visibles | valida: prueba en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] el panel nunca muestra la tabla de columnas | valida: guardar el modo tabla y reabrir el panel — **pendiente: verificación de Leandro en el navegador**
- [fail] en móvil el botón Archivos sigue abriendo el árbol a pantalla completa | valida: DevTools en viewport de teléfono — **pendiente: verificación de Leandro en el navegador**
- [pass] `npm run lint`, `npm run typecheck` y `npm run build:client` en verde | valida: los tres comandos

#### Peligros
- Si se borra la rama `activeTab === 'files'` sin el efecto defensivo, una sesión que quedó con esa tab muestra el área principal **vacía**, y no es obvio por qué.
- `openFile` tiene que seguir envuelto en `useCallback`: `usePaletteOpsRegister` reescribe todo el registro de la paleta si la identidad cambia en cada render.
- Tres columnas más el sidebar dejan el chat muy angosto abajo de ~1400px de viewport.
- El `maxWidth` del editor (80% del contenedor) se calcula sobre un contenedor que ahora es más chico: revisar que el arrastre del editor siga teniendo recorrido útil.

#### Mejores prácticas
- El panel es propio y vive en `skin/`; los cambios en `WorkspaceMain` y `FileTree` son injertos mínimos y con props **opcionales**, para que un `git merge upstream/main` no tenga con qué chocar.
- Ancho en `flex-none` + `style`, no en clases de Tailwind: el valor viene del store.
- El componente exportado lleva el comentario de consumidor que exige `frontend-module-standards`.

---

### Fase 4 — El árbol se actualiza solo cuando el agente termina

**Goal (done-criterion):** Con el panel abierto, pedirle al agente que cree un archivo hace que el archivo aparezca en el árbol sin intervención manual y **sin** colapsar las carpetas abiertas, Y `npm run typecheck` en verde.
**Alcance:** Tocar: `src/modules/skin/SkinFilesPanel.tsx`. Ignorar: `server/` (no hay watcher y no se agrega), `useFileTreeData` (no se modifica), el resto del file-tree.
**Paralelizable:** No — necesita el panel y la prop `refreshSignal` de la Fase 3.

#### Pasos
1. En `SkinFilesPanel`, leer `useBusySessionIdSet()` de `@/shared/context/SessionProtectionContext`.
2. Guardar en un ref si la sesión activa estaba en el set; cuando pasa de presente a ausente (la respuesta terminó), incrementar un contador de estado.
3. Pasar ese contador como `refreshSignal` al `FileTree`.
4. Dejar el botón de refresco manual en la cabecera del panel como red de seguridad.

#### Estado (arranca todo en fail)
- [fail] un archivo creado por el agente aparece solo al terminar la respuesta | valida: pedir un archivo por chat y mirar el panel — **pendiente: verificación de Leandro en el navegador**
- [fail] el refresco conserva las carpetas expandidas y el scroll | valida: expandir dos niveles y disparar un refresco — **pendiente: verificación de Leandro en el navegador**
- [fail] sin el panel abierto no se dispara ninguna request | valida: pestaña Network de DevTools con el panel cerrado — **pendiente: verificación de Leandro en el navegador**
- [fail] el botón manual refresca igual | valida: clic en refrescar — **pendiente: verificación de Leandro en el navegador**
- [pass] `npm run typecheck` y `npm run lint` en verde | valida: los dos comandos

#### Peligros
- Remontar el `FileTree` con `key` "refrescaría" pero perdería expandidos y scroll — por eso la prop y no la key.
- Si una sesión queda colgada en "procesando" el flanco nunca llega y el auto-refresco no dispara. No es regresión: hoy no hay refresco de ningún tipo.

#### Mejores prácticas
- Escuchar el **flanco** (de ocupado a libre), no el estado: suscribirse al estado dispararía un refresco por cada frame de status, varias veces por segundo.
- `useBusySessionIdSet` ya devuelve un set con identidad estable mientras la membresía no cambia; es exactamente el hook para esto.

---

### Fase 5 — El panel se repliega solo cuando no hay lugar

**Goal (done-criterion):** Existe `src/modules/skin/hooks/useFilesPanelRoom.ts` Y achicar la ventana por debajo del umbral oculta el panel mientras `localStorage.getItem('skin:files-panel-open')` sigue en `'1'`, Y agrandarla lo devuelve sin tocar nada, Y `npm run typecheck` en verde.
**Alcance:** Tocar: `src/modules/skin/hooks/useFilesPanelRoom.ts` (nuevo), `src/modules/skin/SkinFilesPanel.tsx`. Ignorar: el store (la preferencia no se toca), `WorkspaceMain`, todo `file-tree`.
**Paralelizable:** No — necesita el panel de la Fase 3.

#### Pasos
1. Crear el hook con dos `matchMedia`: `(min-width: 1400px)` y `(min-width: 1100px)`, leídos con `useSyncExternalStore` igual que `useCompactSidebar`.
2. Regla: con el editor abierto hace falta el umbral alto; con el editor cerrado, el bajo.
3. En `SkinFilesPanel`, devolver `null` cuando no hay lugar. **No** llamar a `toggleFilesPanel`: la preferencia del usuario no se pisa, sólo se ignora mientras no entre.

#### Estado (arranca todo en fail)
- [fail] bajo el umbral el panel desaparece | valida: achicar la ventana en el navegador — **pendiente: verificación de Leandro en el navegador**
- [fail] al agrandar vuelve solo, con su ancho | valida: agrandar la ventana — **pendiente: verificación de Leandro en el navegador**
- [fail] `skin:files-panel-open` no cambia en todo el proceso | valida: `localStorage.getItem('skin:files-panel-open')` antes y después — **pendiente: verificación de Leandro en el navegador**
- [pass] sin listeners de `resize` | valida: `grep -n "resize" src/modules/skin/hooks/useFilesPanelRoom.ts` sin resultados
- [pass] `npm run typecheck` y `npm run lint` en verde | valida: los dos comandos

#### Peligros
- Apagar `filesPanelOpen` al colapsar sería destructivo: al volver a la pantalla grande el panel quedaría cerrado sin que nadie lo haya cerrado. Ocultar ≠ cerrar.
- El botón del header sigue marcado mientras el panel está oculto por espacio. Es deliberado (refleja la preferencia, no la visibilidad) y va en el `title` del botón.

#### Mejores prácticas
- `matchMedia` y no `resize`: el navegador avisa sólo al cruzar el umbral, en vez de en cada píxel de arrastre.
- Un `MediaQueryList` por consulta, compartido — el mismo patrón que ya usa `useCompactSidebar`.

---

### Fase 6 — La pestaña avisa que su sesión está corriendo

**Goal (done-criterion):** Existe `src/modules/skin/hooks/useRunningTabTitle.ts` Y con una sesión produciendo respuesta el `document.title` de **esa** pestaña arranca con `● ` mientras las otras quedan intactas, Y al terminar el prefijo se va, Y `npm run typecheck` en verde.
**Alcance:** Tocar: `src/modules/skin/hooks/useRunningTabTitle.ts` (nuevo), `src/modules/skin/SkinHeader.tsx` (montar el hook). Ignorar: `pageTitleNotification.ts` (no se modifica), `src/modules/chat/**`.
**Paralelizable:** Sí — no comparte archivos con las Fases 3, 4 y 5.

#### Pasos
1. Crear el hook: lee `useBusySessionIdSet()` y el id de la sesión seleccionada; marca sólo si **esa** sesión está en el set.
2. Aplicar y quitar el prefijo `● ` sobre el `document.title` vigente, quitándolo desde cualquier posición para no pelear con el `[Done] ` que antepone `pageTitleNotification.ts`.
3. Limpiar el prefijo al desmontar.
4. Montarlo una sola vez, en `SkinHeader`.

#### Estado (arranca todo en fail)
- [fail] la pestaña con la sesión corriendo muestra `●` | valida: mandar un mensaje y mirar la pestaña — **pendiente: verificación de Leandro en el navegador**
- [fail] una segunda pestaña con otra sesión **no** se marca | valida: dos pestañas, una sola corriendo — **pendiente: verificación de Leandro en el navegador**
- [fail] al terminar el `●` desaparece | valida: esperar el fin de la respuesta — **pendiente: verificación de Leandro en el navegador**
- [fail] el `[Done]` de fondo sigue funcionando y no deja basura | valida: dejar terminar una respuesta en segundo plano — **pendiente: verificación de Leandro en el navegador**
- [pass] `npm run typecheck` y `npm run lint` en verde | valida: los dos comandos

#### Peligros
- `useBusySessionIdSet` es **global**: trae todas las sesiones que corren en el servidor. Marcar por "hay alguna corriendo" pintaría las cuatro pestañas iguales y el indicador no serviría para nada. Hay que filtrar por la sesión de la pestaña.
- Dos escritores sobre `document.title` se pisan. El strip tiene que tolerar que el `●` no esté al principio.

#### Mejores prácticas
- Nada de `MutationObserver` sobre el título: el efecto se re-dispara con el set y con la sesión seleccionada, que son los dos únicos momentos en que el valor correcto cambia.
- Hoy el título base es estático (`LT Space`): el único que lo reescribía era `SidebarProjectList`, que es código muerto.

---

### Fase 7 — Build, verificación real y push

**Goal (done-criterion):** `npm run lint`, `npm run typecheck`, `npm run test:client` y `npm run build:client` terminan los cuatro sin error, Leandro confirma en `:8443` las dos funcionalidades, Y `git log origin/diseno/propio -1` muestra el commit de este trabajo.
**Alcance:** Tocar: nada de código salvo lo que rompa un check. Ignorar: todo lo demás.
**Paralelizable:** No — es el cierre.

#### Pasos
1. Correr los cuatro comandos.
2. `npm run build:client` y recargar duro `:8443` (`Ctrl+Shift+R`: el service worker cachea el bundle).
3. Verificación manual: escribir en el chat con el panel abierto; rueda del ratón sobre una sesión; Ctrl+click sobre otra; dos pestañas con sesiones distintas corriendo a la vez.
4. Actualizar `## Cambios realizados` y `## Continuación de Sesión`, pasar el plan a `completado` y moverlo a `plans/_archivo/` en el mismo commit.
5. `git commit` y `git push` en `diseno/propio`.

#### Estado (arranca todo en fail)
- [pass] `npm run lint` en verde | valida: `npm run lint`
- [pass] `npm run typecheck` en verde | valida: `npm run typecheck`
- [pass] `npm run test:client` en verde | valida: `npm run test:client`
- [pass] `npm run build:client` en verde | valida: `npm run build:client`
- [fail] chat + archivos a la vez, confirmado por Leandro | valida: prueba en `:8443` — **pendiente: verificación de Leandro en el navegador**
- [fail] rueda del ratón abre la sesión en pestaña nueva, confirmado por Leandro | valida: prueba en `:8443` — **pendiente: verificación de Leandro en el navegador**
- [fail] dos pestañas con sesiones distintas conviven sin romperse | valida: prueba en `:8443` — **pendiente: verificación de Leandro en el navegador**
- [fail] plan archivado y rama pusheada | valida: `git log origin/diseno/propio -1` — **pendiente: verificación de Leandro en el navegador**

#### Peligros
- **Recargar normal no alcanza:** el service worker sirve el bundle viejo y parece que el cambio no se aplicó. Ya pasó en este repo.
- El servidor corre como `node dist-server/server/index.js` lanzado a mano (PID vivo desde las 14:44), no por systemd: sirve `dist/` desde disco, así que `build:client` + recarga dura alcanza y **no hay que reiniciarlo**. Sí habría que reiniciarlo si se tocara `server/`, cosa que este plan no hace.

#### Mejores prácticas
- Verificar ejecutando, no leyendo el diff. Los checks de interfaz de este plan sólo los puede cerrar un humano frente al navegador.
- Un commit por fase, con el prefijo que usa el repo (`feat(skin): …`, `fix(skin): …`).

---

## Orden de ejecución

- **Fases 1, 2 y 3 en paralelo:** no comparten un solo archivo. La 1 vive en `SkinSidebar`, la 2 en `settings` + `ProjectWorkspaceShell`, la 3 en `skin` + `WorkspaceMain` + `file-tree`.
- **Fases 4 y 5 después de la 3:** las dos necesitan el panel montado.
- **Fase 6 en paralelo** con todo: no comparte archivos con nadie.
- **Fase 7 al final**, con todo integrado.

Si se ejecuta en serie, el orden que antes da algo usable es **1 → 3 → 4 → 5 → 2 → 6 → 7**: la Fase 1 son treinta líneas y resuelve la mitad del pedido.

## Verificación final

Con el build nuevo cargado en `:8443`:

1. Abrir una sesión, apretar el botón Archivos: el árbol aparece a la derecha **y el chat sigue visible**. Escribir un mensaje sin cerrar el panel.
2. Pedirle al agente que cree un archivo. Al terminar la respuesta, el archivo aparece solo en el árbol.
3. Clic en un archivo: se abre el editor entre el chat y el árbol. Las tres columnas se arrastran.
4. Rueda del ratón sobre otra sesión del sidebar: se abre en una pestaña nueva del navegador, ya cargada en esa sesión.
5. Ctrl+click sobre una tercera: ídem, en segundo plano.
6. Ajustes → Apariencia: los tres toggles están y persisten.
7. Recargar duro: el panel vuelve con el mismo ancho y el mismo estado.
8. Achicar la ventana: el panel se repliega solo; agrandarla lo devuelve, y la preferencia guardada no cambió.
9. Con dos pestañas en sesiones distintas, mandar un mensaje en una: **sólo esa** pestaña muestra el `●` en el título.

## Riesgos globales

- **El riesgo real es el merge con upstream, no el runtime.** Cuatro archivos de upstream reciben injertos. Están acotados y son props opcionales, pero cada uno es un punto de conflicto futuro. Si un `git merge upstream/main` los toca, revisar primero `WorkspaceMain.tsx`.
- **Varias pestañas = varios WebSockets.** Es el objetivo del pedido y no está probado en este fork: notificaciones duplicadas y doble conteo en el medidor de 5 h son los síntomas a vigilar. Ninguno rompe nada.
- **Sin watcher en el backend**, el árbol siempre va un paso atrás de lo que pasa en disco entre respuesta y respuesta.

---

## Cambios realizados

Todo lo planificado, con cuatro desvíos que valen la pena anotar:

1. **`NODE_ENV=production` está fijado en el entorno del VPS**, así que `npm run test:client` falla con *"act(...) is not supported in production builds of React"* — y falla igual en `master`, sin tocar nada. Los tests hay que correrlos con `NODE_ENV=test npx vitest run`. No es de este trabajo, pero cualquiera que corra la suite acá se lo va a comer.
2. **La prop del `FileTree` se llama `narrow`, no `compact`**: `FileTreeViewMode` ya tiene un modo llamado `'compact'` y las dos cosas juntas eran una trampa de lectura. El modo que fuerza el panel es `'simple'`.
3. **El módulo `quick-settings-panel` sigue en el árbol**, sin consumidores y con un comentario que explica por qué. Se desmontó de `ProjectWorkspaceShell`; borrarlo abriría conflicto en cada merge con upstream.
4. **El botón de archivos quedó fuera del `<nav>` de pestañas**, separado del grupo: es una columna que se abre al lado, no una vista que reemplaza lo que estás mirando, y el botón tenía que decirlo.

Durante la ejecución llegaron commits nuevos al repo desde otra sesión (`8f00b197` del medidor de contexto, `5a705e1a` con este plan y su boceto), que cambiaron `src/modules/skin/index.ts` y `SkinHeader.tsx`. Se releyeron los dos antes de editarlos.

---

## Continuación de Sesión

**Fases completadas:** 1 a 6, en código. Los checks de comando (lint, typecheck, 434 tests, build) están en `[pass]`.
**Fase actual:** Fase 7 — falta sólo la verificación visual.
**Próximo paso exacto:** recargar duro `:8443` (Ctrl+Shift+R) y recorrer los nueve puntos de `## Verificación final`. Si algo falla, se corrige acá mismo: el plan no se archiva hasta que pasen.
**Bloqueantes:** ninguno técnico. Los checks marcados "pendiente: verificación de Leandro" no los puede cerrar un agente sin navegador.
**Micro-tasks pendientes:** 2 de 27 (verificación visual y push)
