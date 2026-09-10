# Tema oscuro visible, notificaciones al navegador y razonamiento a la vista

**Fecha:** 10 de Septiembre 2026
**Estado:** completado

Tres pedidos que parecían features nuevas y resultaron ser, casi todos, capacidades ya construidas que nadie puede encontrar ni encender. El trabajo real es de exposición y cableado, no de construcción.

---

## Contexto

Leandro pidió tres cosas: modo oscuro, notificaciones de escritorio en su navegador de Windows, y modo de razonamiento extendido. La exploración del fork encontró que **dos de las tres ya están implementadas end-to-end** y la tercera está a medio camino. El problema no es capacidad: es descubribilidad y un interruptor apagado.

**1 · Tema oscuro — existe y funciona.** `ThemeProvider` montado en `App.tsx:114`, toggle renderizado en `Ajustes → Apariencia`, Tailwind en `darkMode: ["class"]`, y el skin propio con su paleta oscura escrita a mano en `tokens.css:82-105`. Se verificó que el string "Modo oscuro" está en el bundle servido hoy. Leandro no lo encontró porque vive a dos clics dentro de un modal, y el header de LT Space no lo ofrece.

**2 · Notificaciones — el backend está entero y el navegador no está enchufado.** Existe el canal WebSocket `/desktop-notifications`, el orquestador con dedupe de 20s y payloads ya formateados (`notification-orchestrator.service.js:151-178`), preferencias por evento en DB, y el canal `desktop` ya declarado en `notificationChannels:218-222`. Lo consume **únicamente la app de Electron**. En el navegador, `window.cloudcliDesktopNotifications` es `null`, así que la fila de Ajustes ni siquiera se dibuja (`Settings.tsx:43`) y nadie llama nunca a `new Notification()`. Hoy, con la pestaña abierta, el único aviso de "terminó" es `[Done]` en el título y un tono de WebAudio.

**Consecuencia importante: este trabajo no toca el servidor.** El canal, el fanout, el dedupe y el filtro por preferencias ya existen y son agnósticos del cliente.

**3 · Razonamiento — el control existe pero nunca se aplica.** El menú del composer (`ComposerModelMenu.tsx`) ya tiene una sección "Reasoning" con `low/medium/high/xhigh/max/ultracode`. Pero el valor inicial es el string `'default'`, y ahí se corta la cadena en dos lugares:

- El cliente nunca preselecciona el `effort.default: 'high'` que declara el catálogo: `reconcileStoredEffort` (`useChatProviderState.ts:349-351`) devuelve `DEFAULT_EFFORT_VALUE` y listo.
- El servidor, con `effort === 'default'`, hace que `resolveClaudeEffort` devuelva `undefined` y `applyClaudeEffort` retorne sin setear nada (`claude-runtime.provider.js:91-112`).

O sea: **hoy no se le pide al SDK ningún nivel de razonamiento**, corre con el default del binario. Y el composer no muestra ninguna pista, porque el sufijo `· xhigh` solo se dibuja cuando el effort **no** es `'default'` (`ComposerModelMenu.tsx:97`). La sensación de "esto no está configurado" era correcta.

**Alcance decidido:** hacer el tema descubrible (más "Sistema" y matar el flash blanco), enchufar el navegador al canal de notificaciones que ya existe, y poner el nivel de razonamiento a la vista. **No** se agrega `ThinkingConfig` del SDK ni se cambia el default de razonamiento: ambas quedan fuera, anotadas al final.

---

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `src/shared/userSettings.ts` | modificar — `theme` pasa de `'light' \| 'dark'` a incluir `'system'` (línea 20) |
| `src/shared/context/ThemeContext.tsx` | modificar — tri-estado; expone `themePreference` + `setThemePreference` además de `isDarkMode` |
| `index.html` | modificar — script inline anti-FOUC antes del bundle; alinear `<meta name="theme-color">` (línea 31) |
| `src/modules/settings/tabs/AppearanceSettingsTab.tsx` | modificar — el toggle binario pasa a selector de tres estados |
| `src/modules/skin/SkinHeader.tsx` | modificar — botón sol/luna junto a `PanelLeft` (línea 146) e indicador de razonamiento |
| `src/modules/notifications/` | **crear** — módulo nuevo: hook de conexión, permiso y render de la notificación |
| `src/modules/settings/tabs/NotificationsSettingsTab.tsx` | modificar — fila para el navegador, hoy condicionada al bridge de Electron |
| `src/modules/settings/Settings.tsx` | modificar — cablear la fila nueva (línea 40-45) |
| `src/App.tsx` | modificar — montar el provider de notificaciones dentro de `AuthProvider` |
| `src/modules/chat/composer/ComposerModelMenu.tsx` | modificar — mostrar el nivel siempre, no solo cuando difiere del default (línea 97) |
| `vite.config.js` | modificar — agregar `/desktop-notifications` al proxy (líneas 39-52), solo afecta dev |
| `src/modules/i18n/locales/{en,es}/*.json` | modificar — claves nuevas; el resto de idiomas vía `defaultValue` inline |

**No se toca `server/`.** Si un paso pide cambiar el servidor, el diseño está mal: frenar y revisar.

---

### Fase 0 — Poner a salvo lo que ya está hecho

**Goal:** `diseno/propio` tiene 3 commits sin pushear (`0b483f53`, `4c74e79c`, `63a56421` — rebranding LT Space, confirmación de archivado, selector solo-Claude). Hasta que se pusheen, ese trabajo solo existe en este disco.
**Paralelizable:** no — va primero, antes de escribir una línea nueva.

### Fase 1 — El tema, a la vista

**Goal:** que el modo oscuro se encienda desde el header con un clic, que exista "Sistema", y que no haya destello blanco al cargar.
**Paralelizable:** sí, con la Fase 3.

El orden importa: primero el tri-estado en el modelo de datos (`userSettings` + `ThemeContext`), después los dos consumidores de UI. El servidor **no** necesita cambios: `readPreferenceUpdates` (`user.service.ts:61-81`) no tiene allowlist de claves, así que acepta `theme: 'system'` tal cual.

El anti-FOUC es un script inline en `index.html` que lee el espejo de localStorage (`user-preferences`, definido en `userSettings.ts:39`) y aplica la clase `dark` en `<html>` antes de que React monte. Sin él el flash es inevitable: hoy la clase se aplica recién en un `useEffect`.

### Fase 2 — El navegador escucha el canal que ya existe

**Goal:** que al terminar un comando aparezca una notificación nativa de Windows, con ícono, aunque la pestaña esté en segundo plano.
**Paralelizable:** no — es la fase más grande y toca `App.tsx`.

Diseño, en una línea: **el navegador se registra en `/desktop-notifications` igual que lo hace Electron, y renderiza el payload que ya viene formateado.**

El protocolo está fijado por el servidor y no se negocia:
1. Conectar a `wss://<host>/desktop-notifications?token=<jwt>` (misma construcción de URL que `WebSocketContext.tsx:36-45`).
2. Enviar `{ type: 'register', deviceId, label, platform: 'web', appVersion }`. El `deviceId` debe ser **estable por navegador** (generar un UUID y guardarlo en localStorage) — si cambia en cada carga, la tabla de endpoints se llena de fantasmas.
3. El servidor responde `{ type: 'registered', deviceId, enabled }`. Se registra con `enabled: true` (`desktop-notification-clients.service.ts:58`).
4. Al llegar `{ type: 'notification', id, payload }`, llamar `new Notification(payload.title, { body: payload.body, icon: '/logo-256.png', tag: payload.data?.tag })`.

Tres condiciones que tienen que darse a la vez, y por eso la UI de Ajustes tiene que mostrar las tres:
- Permiso del navegador concedido (`Notification.requestPermission()`).
- La preferencia `channels.desktop` en `true` — **su default es `false`** (`notification-preferences.ts:27`), es el interruptor que hoy está apagado.
- Los eventos que interesan activos; `stop`, `error` y `actionRequired` ya vienen en `true`.

El ícono sale de `/logo-256.png`, el mismo que ya usa el Service Worker (`sw.js:76`).

**Al clic, la notificación tiene que llevar a la sesión.** Ya hay un receptor de navegación (`ProjectEffects.tsx:24-56`) que escucha `{ type: 'notification:navigate', sessionId, provider, urlPath }`. Reusarlo: el `onclick` de la notificación hace `window.focus()` y dispara el mismo mensaje. No inventar una segunda ruta de navegación.

**Qué NO cubre esta fase:** el fin de un comando en la pestaña Terminal. El PTY no emite ningún evento de fin (`shell-websocket.service.ts:508-530` solo escribe texto ANSI amarillo dentro del stream de `output`), y un shell interactivo sin OSC 133 no distingue "terminó un comando" de "terminó el shell". Esto cubre el fin de turno del agente, que es lo que se pidió. Ver Análisis Crítico.

### Fase 3 — El razonamiento, a la vista

**Goal:** saber de un vistazo en qué nivel de razonamiento estás, sin abrir ningún menú.
**Paralelizable:** sí, con la Fase 1.

Dos cambios chicos y honestos:
- En `ComposerModelMenu.tsx:97`, mostrar el sufijo **siempre** que el modelo tenga efforts, incluido `'default'`. Que diga `Opus (1M context) · default` en vez de callarse.
- En `SkinHeader.tsx`, un indicador de solo lectura con el nivel activo, con tooltip.

**Deliberadamente no se cambia el comportamiento.** El default sigue siendo el del binario. Si al ver "· default" en pantalla la decisión es subirlo, ese es otro plan de una línea (`useChatProviderState.ts:349-351`, preseleccionar el `effort.default` del catálogo) — pero cambia el costo y la latencia de cada turno, y no se decide de contrabando dentro de un plan de visibilidad.

---

## Micro-tasks

**Fase 0**
- [x] `git push origin diseno/propio` — acepta: `git log origin/diseno/propio..diseno/propio` vacío | valida: correr ese comando
- [x] Correr `git status --short` y confirmar que ninguna otra sesión dejó cambios sin commitear (hubo sesiones concurrentes) — acepta: solo `.env.bak-20260908` sin trackear | valida: `git status --short`

**Fase 1 — tema**
- [x] Ampliar el tipo `theme` a `'light' | 'dark' | 'system'` en `userSettings.ts:20` — acepta: typecheck pasa | valida: `npm run typecheck`
- [x] Reescribir `ThemeContext.tsx` a tri-estado: expone `themePreference`, `setThemePreference` e `isDarkMode` derivado; con `'system'` sigue a `matchMedia` en vivo — acepta: los 8 consumidores de `useTheme()` siguen compilando | valida: `npm run typecheck` + `grep -rn "useTheme()" src/`
- [x] Actualizar `src/shared/tests/themeContext.test.tsx` para cubrir los tres estados, incluido el cambio de tema del sistema con `'system'` activo — acepta: test pasa | valida: `npx vitest run src/shared/tests/themeContext.test.tsx`
- [x] Agregar script inline anti-FOUC en `index.html` antes del bundle, leyendo la clave `user-preferences` — acepta: recarga con tema oscuro sin destello blanco | valida: recarga dura (Ctrl+Shift+R) mirando la pantalla
- [x] Alinear `<meta name="theme-color">` (`index.html:31`) con los valores que inyecta `ThemeContext` (`#141414` / `#f6f4ef`) — acepta: no hay dos fuentes de verdad | valida: `grep theme-color index.html`
- [x] Reemplazar `DarkModeToggle` por un selector de tres opciones en `AppearanceSettingsTab.tsx:35-44`, con el patrón `SettingsRow` + `select` que ya usa la fila de orden de proyectos (líneas 52-68) — acepta: las tres opciones cambian el tema al instante | valida: click manual en las tres
- [x] Agregar botón sol/luna en `SkinHeader.tsx` junto al de `PanelLeft` (línea 146), con `Tooltip` y el mismo `className` de los botones-ícono del header — acepta: un clic alterna claro/oscuro | valida: click manual
- [x] Revisar `QuickSettingsContent.tsx:84-95`, que usa el mismo `DarkModeToggle` binario — acepta: coherente con el tri-estado, sin dos controles que se contradigan | valida: cambiar en un lado y mirar el otro
- [x] Agregar claves i18n de tema en `en` y `es`; el resto vía `defaultValue` inline — acepta: en español dice "Claro / Oscuro / Sistema" | valida: abrir Ajustes en español
- [x] (verificado, sin cambios) Revisar en oscuro los 3 archivos con color hardcodeado no-terminal: `PromptInput.tsx` (`bg-white`), `ChatMessageImages.tsx`, `BrowserUsePanel.tsx` — acepta: nada blanco fuera de lugar | valida: inspección visual con tema oscuro. Los 6 de `shell/` se dejan como están: un terminal es oscuro siempre, a propósito

**Fase 2 — notificaciones**
- [x] Crear `src/modules/notifications/` con su `index.ts` barrel, siguiendo `frontend-module-standards` (alias `@/`, `type` y no `interface`, sin deep-imports) — acepta: estructura conforme | valida: `npm run lint`
- [x] Implementar `deviceId` estable en localStorage (`crypto.randomUUID()` la primera vez) — acepta: el mismo id sobrevive a recargas | valida: recargar dos veces y comparar en DevTools
- [x] Implementar el hook de conexión a `/desktop-notifications`: URL con token igual que `WebSocketContext.tsx:36-45`, `register` al abrir, reconexión con backoff, cierre limpio al desmontar — acepta: el servidor responde `registered` | valida: DevTools → Network → WS, ver el frame
- [x] Renderizar `new Notification(payload.title, { body, icon: '/logo-256.png', tag: payload.data?.tag })` al recibir `type: 'notification'` — acepta: aparece la notificación de Windows con ícono | valida: lanzar un comando largo y esperar a que termine
- [x] Cablear el `onclick`: `window.focus()` + postear `{ type: 'notification:navigate', ... }` al receptor que ya existe en `ProjectEffects.tsx:24-56` — acepta: el clic abre la sesión correcta | valida: notificar desde una sesión, estar en otra, hacer clic
- [x] Montar el provider en `App.tsx` dentro de `AuthProvider` (necesita el token) — acepta: no se conecta si no hay sesión iniciada | valida: cerrar sesión y confirmar que no hay WS colgado
- [x] Agregar en `NotificationsSettingsTab.tsx` una fila para el navegador que muestre los tres estados: permiso, `channels.desktop`, y conexión al canal — acepta: se ve en el navegador, donde hoy no se dibuja nada | valida: abrir Ajustes → Notificaciones en el navegador
- [x] Cablear esa fila en `Settings.tsx:40-45`, sin romper el camino de Electron (`window.cloudcliDesktopNotifications`) — acepta: en Electron sigue apareciendo su fila propia | valida: `npm run typecheck` + lectura del condicional
- [x] Botón "Probar notificación" en esa fila que dispare una `Notification` local — acepta: prueba el permiso sin depender de que termine un comando | valida: click manual
- [x] Agregar `/desktop-notifications` al proxy de `vite.config.js:39-52` con `ws: true` — acepta: funciona también en `npm run dev` | valida: levantar dev y ver la conexión
- [x] Claves i18n en `en` y `es` bajo `notifications.*` del namespace `settings` — acepta: en español se lee bien | valida: abrir el tab en español
- [x] Test del reductor de mensajes del canal (payload → argumentos de `Notification`) en `src/modules/notifications/tests/` — acepta: cubre notificación válida, payload incompleto y mensaje desconocido | valida: `npx vitest run src/modules/notifications`

**Fase 3 — razonamiento**
- [x] Quitar la condición `effort !== DEFAULT_EFFORT_VALUE` de `ComposerModelMenu.tsx:97` para que el nivel se muestre siempre que el modelo tenga efforts — acepta: el composer dice `· default` en vez de callarse | valida: abrir el chat y mirar
- [ ] ~~Agregar indicador de solo lectura del nivel activo en `SkinHeader.tsx`~~ — **no se hizo**, ver Cambios realizados
- [x] Verificar que Haiku (único modelo sin bloque `effort`) no muestre indicador vacío — acepta: con Haiku no se dibuja nada | valida: cambiar a Haiku y mirar

**Cierre**
- [x] `npm run typecheck` y `npm run lint` en verde — acepta: 0 errores nuevos | valida: correr ambos
- [x] `npm run test:client` en verde — acepta: sin regresiones | valida: correr
- [x] `npm run build` y relanzar el servicio; probar en el navegador de Windows contra `https://leandro-servidor.taila8c262.ts.net:8443` — acepta: las tres features andan | valida: sesión manual
- [x] Marcar el plan `completado`, agregar `## Cambios realizados` y moverlo a `plans/_archivo/` en el mismo commit — acepta: el estado del plan no miente | valida: `ls plans/_archivo/`
- [x] `git push origin diseno/propio` — acepta: nada sin pushear | valida: `git log origin/diseno/propio..diseno/propio`

---

## Verificación end-to-end

El servicio corre desde el build de producción (`node dist-server/server/index.js`, bind a `100.77.186.53:3001`, expuesto por `tailscale serve` en `:8443`). **Un cambio en `src/` no se ve hasta correr `npm run build:client`** — no alcanza con guardar el archivo. Al terminar: `npm run build` y relanzar el proceso.

1. **Tema:** recargar en frío con tema oscuro → no hay destello blanco. Clic en el sol/luna del header → alterna. Ajustes → Apariencia → "Sistema" → cambiar el tema de Windows y ver que sigue.
2. **Notificaciones:** Ajustes → Notificaciones → conceder permiso y activar el canal. "Probar notificación" → aparece con ícono. Después, lanzar un comando largo, cambiar de pestaña, y confirmar que al terminar llega el aviso y que el clic abre esa sesión.
3. **Razonamiento:** el composer muestra el nivel activo sin abrir el menú; el header también; con Haiku no se muestra nada.

---

## Análisis Crítico

### Incongruencias detectadas

- **El pedido y el código no coinciden.** Dos de las tres features ya existían. Vale la pena preguntarse qué otra cosa ya está construida y apagada: el patrón acá es que upstream trae capacidades y el fork nunca las expone. El canal `inApp` es otro caso — está en el tipo (`types.ts:1160`) y en la DB, pero no tiene entrada en `notificationChannels` ni casilla en la UI: está muerto.
- **El Service Worker se registra dos veces**, en `index.html:44` y en `src/main.tsx:21`. Es benigno pero es una duplicación que confunde. No se toca en este plan; anotarlo.
- **`effort.default` del catálogo es decorativo.** Cada modelo declara un default (`'high'` para Opus 1M) que ningún código lee. O se usa o se borra; tenerlo ahí sugiere un comportamiento que no ocurre.
- **Dos controles de tema que pueden discrepar.** Quick Settings y Ajustes usan hoy el mismo `DarkModeToggle` binario. Al pasar a tri-estado, un switch de dos posiciones no puede representar tres: si Quick Settings queda binario, "Sistema" se pierde en cuanto se lo toca.

### Huecos conocidos

- **La terminal queda afuera.** El pedido decía "cuando termine de ejecutarse un comando", y en la pestaña Terminal eso no es observable hoy: el PTY solo escribe texto ANSI al salir. Hacerlo bien pide un frame `{ type: 'exit', exitCode }` en `shell-websocket.service.ts:508` — y aun así un shell interactivo sin OSC 133 no sabe dónde termina un comando y empieza el siguiente. Esta fase cubre el fin de turno del agente. Si hace falta la terminal, es otro plan, y toca servidor.
- **Solo notifica con la pestaña viva.** Es la contrapartida de elegir el canal WebSocket: es instantáneo y no depende de Google ni Mozilla, pero muere con la pestaña. Web Push ya está construido y cubre el navegador cerrado; se puede encender en paralelo desde Ajustes sin escribir código. Si se encienden los dos, **van a llegar avisos duplicados**: el dedupe de 20s del orquestador es por evento, no por canal, y los dos canales reciben el mismo payload a propósito.
- **`tailscale serve` y WebSockets de larga duración.** `/ws` ya funciona por ahí, así que el riesgo es bajo, pero es una segunda conexión persistente. Si se cae en silencio, la reconexión con backoff es lo único que lo salva: no la dejes para después.
- **Chrome puede revocar el permiso** si se ignoran las notificaciones. Si un día dejan de llegar, chequear `Notification.permission` antes de sospechar del código: por eso la fila de Ajustes muestra el estado del permiso y no solo un switch.

### Áreas a monitorear

- **`ThemeContext` tiene 8 consumidores** (`CodeEditor`, `MermaidDiagram`, `MarkdownCodeBlock`, `PluginTabContent`, el export de transcript, el command palette, Settings y Quick Settings). Cambiar su API es el punto de mayor riesgo de romper algo lejano. Mantener `isDarkMode` como valor derivado y no borrarlo.
- **`buildTranscriptHtml.tsx:77` lee `classList.contains('dark')` directo**, sin pasar por el contexto. Con `'system'` sigue funcionando porque la clase se aplica igual — pero es un acoplamiento a vigilar.
- **Presupuesto de merge.** La regla del fork es concentrar lo propio en `src/modules/skin/` y `src/index.css` para poder seguir tragando upstream. Este plan toca `ThemeContext`, `AppearanceSettingsTab`, `NotificationsSettingsTab`, `Settings.tsx`, `App.tsx` y `ComposerModelMenu` — todos archivos de upstream, todos conflictos futuros. El módulo `src/modules/notifications/` es carpeta nueva y no conflictúa; los otros se pagan en cada merge. Mantener cada cambio lo más chico posible, y preferir agregar sobre reescribir.
- **Sesiones concurrentes.** Ya pasó con el plan anterior: hay otras sesiones de Claude Code trabajando sobre este mismo repo. Correr `git status --short` antes de cada fase.

---

## Cambios realizados

Tres commits en `diseno/propio`:

| Commit | Qué |
|---|---|
| `eb51eb0d` | Tema: botón en la cabecera, tri-estado con `system`, anti-FOUC |
| `004f8ced` | Notificaciones: el navegador se registra en `/desktop-notifications` |
| *(este)* | Razonamiento: el nivel se muestra siempre en el composer |

**Fase 1 — tema.** `ThemePreferenceSelect` (nuevo, en `src/shared/ui/`) reemplaza a `DarkModeToggle` en Ajustes y en el panel rápido; `DarkModeToggle` queda en el árbol sin consumidores. `ThemeContext` pasó a tri-estado manteniendo `isDarkMode` para sus 8 consumidores, y ahora expone `themePreference` y `setThemePreference`. El tipo `ThemePreference` vive en `src/shared/types.ts`. El script anti-FOUC de `index.html` lee el mismo espejo de localStorage que el contexto. El test del contexto pasó de 5 a 9 casos, con un `matchMedia` controlable para poder mover el SO a mitad de un test.

**Fase 2 — notificaciones.** Módulo nuevo `src/modules/notifications/`, sin una sola línea de servidor. El reductor de payloads (`browserNotificationPayload.ts`) quedó separado del socket para poder testearlo: 6 casos. `ProjectEffects` ahora escucha `notification:navigate` en `window` además de en el service worker, con chequeo de `origin`, para no tener dos copias de las reglas de navegación.

**Fase 3 — razonamiento.** Un cambio de una condición en `ComposerModelMenu.tsx`.

### Lo que no se hizo, y por qué

**El indicador de razonamiento en `SkinHeader` quedó afuera.** El effort nace dentro de `ChatInterface` (vía `useChatProviderState`), que es hermano del header bajo `WorkspaceMain`, no su ancestro. Llevarlo hasta ahí exigía levantar el estado a `WorkspaceMain` — cirugía sobre archivos de upstream, que es exactamente el presupuesto de merge que este fork trata de no gastar. El composer ya muestra el nivel de forma permanente sobre el input, que es donde se mira. Si más adelante hace falta en el header, el camino es un store propio en `src/modules/skin/`, no props atravesando tres componentes.

**Los 3 archivos con color hardcodeado no necesitaban cambios.** Los tres (`ChatMessageImages.tsx:117`, `BrowserUsePanel.tsx:347`, `PromptInput.tsx:174`) son overlays sobre fondos oscuros propios — un lightbox, un tooltip, un indicador — no superficies que sigan el tema.

### Arreglado de paso

`src/shared/tests/pageTitle.test.ts` seguía esperando `'CloudCLI UI'` desde el rebranding a LT Space del plan anterior: 2 tests rotos en la rama, ajenos a este trabajo.

### Verificación

`npm run typecheck` (cliente y servidor) en 0, `npm run test:client` en 406/406, `npm run build` limpio, y el servicio relanzado sirviendo el bundle nuevo (`index-B_RxeOxm.js`) con el anti-FOUC presente en el HTML servido.

**Falta la prueba en el navegador de Windows** — las tres features están verificadas por build y por test, no por uso. En particular: conceder el permiso, marcar "Enviar avisos a este navegador" y **guardar** en Ajustes, porque `channels.desktop` viene apagado por defecto y sin ese paso no llega ningún aviso.
