# Rediseño de la vista principal de CloudCLI: cabecera, barra lateral y compositor

**Fecha:** 09 de Octubre 2026
**Estado:** en-ejecucion (Fases 0-4, 7 y 8 cerradas; quedan la verificación de tmux en `:3001`, `npm run build` y la confirmación de Leandro en `:8446`)

Se rediseña la vista principal de CloudCLI (cabecera, barra de cuota, barra lateral, estado vacío y compositor) para que se parezca al chat `/claude` de Optimum: minimalista, sin botones que no se usan y con casi nada de texto. **La Fase 0 es un boceto HTML que Leandro aprueba antes de tocar una línea de código.**

---

## Contexto

Leandro ve la vista principal «fea» y recargada (9-oct, con capturas de `:8446` y de Optimum). Lo concreto que pidió:

| Qué | Decisión / pedido de Leandro (9-oct) |
|---|---|
| Cabecera | Está llena. Sacar **Git, Navegador y Terminal** del todo (no los usa). **Archivos** pasa a un panel lateral que se abre a la derecha. |
| Cuota | «Ventana 5h 12% · Semanal 83% · dato real · resetea en…» se ve mal. Rediseñar cómo se muestra. |
| Barra lateral | Se despliega sola al poner el cursor encima. **Decidió que empuje el chat** (no flota encima). Sin botones de más. |
| Botones de la barra | Quitar: **actualizar**, **ver archivados**, **mostrar sesiones tmux vivas**. **Nuevo proyecto** pasa junto a **Ajustes**. **Nueva sesión** falla a veces: diagnosticar. «Consola» ocupa mucho. |
| Estado vacío | Sacar «Elige tu asistente de IA», «Selecciona un proveedor…», «Listo para usar Claude con opus…», «Pulsa Ctrl+K…». |
| Compositor | Llevarlo al estilo Optimum: minimalista, no tosco. |
| Tiempo real | En Optimum el texto se arma en vivo y le encanta; en las **sesiones de tmux** de CloudCLI no lo ve así. |
| Proceso | Boceto HTML primero, con `apple-design` + `aos-dev:ui-ux-pro-max`, mínimo texto, ⓘ por sección. Nada se ejecuta sin su visto bueno. |

### Respuestas a las dudas que Leandro dejó abiertas (verificadas en el código y en el plan del 5-oct)

- **¿Para qué existe «Archivados»?** Porque la limpieza automática (plan `05-octubre-limpieza-barra-viva.md`) archiva sola los proyectos fuera del top 3 y las sesiones con más de 72 h. Archivar **no borra**: es la única forma de recuperar algo que desapareció de la barra. Propuesta: **no se elimina, se esconde** en un menú ⋯ de la barra; ya no ocupa un botón visible.
- **¿Para qué existe «Actualizar»?** Es un re-escaneo manual (`onRefresh` → `useSidebarController`). Con el registro de tmux y el watcher la barra debería actualizarse sola; **se quita solo después de medirlo** (Fase 1). Si el automático falla en algún caso, se arregla el automático, no se deja el botón.
- **«Mostrar sesiones tmux vivas»**: es un modo de filtro (`searchMode: 'running'`). Se quita; el estado de cada sesión (`libre`, `dormida`, `esperando`) ya dice cuáles están vivas.
- **Dato de Fase 0 del plan:** el streaming por pane en vivo ya está construido (`tmux-pane-vivo.service.ts`, lector cada ~400 ms, plan `05-octubre-revision-punta-a-punta.md`, Fase 6/7). Que Leandro no lo vea no es un tema de diseño: **hay que reproducirlo** antes de tocar nada.

### Lo que este plan hereda y no rehace

- `design-system/` de CloudCLI: sans única, un acento, grises, Claude sin burbuja, columna `max-w-3xl`, materiales translúcidos, springs `damping 1.0`. Es la base; este plan la aplica a la cabecera, la barra y el compositor.
- Boceto previo `design-system/visual-refs/05-octubre-header-barra.html` y `05-octubre-chat.html`: punto de partida del boceto nuevo, no se descartan, se reemplazan por el nuevo si Leandro aprueba.

### Restricciones operativas

- Trabajo en la rama `diseno/propio` de `~/cloudcli`, **en un worktree** (`wt new rediseno-vista-principal`): hay otras sesiones sobre `~/cloudcli` y un archivo sin trackear ajeno (`server/modules/websocket/tests/zz-probe.test.ts`). REGLA 8.
- Cada cambio de `src/` se cierra con `npm run build` **antes** de reiniciar. El reinicio lo hace Leandro desde `ct` o ttyd, nunca desde una terminal que cuelgue del servicio. Hard refresh después.
- Tests: `NODE_ENV=test npx vitest run <ruta>` (cliente) y `npm test` (servidor).
- Estándar de diseño (REGLA 13): `apple-design` y `aos-dev:ui-ux-pro-max` **antes** del HTML; mínimo texto, ⓘ por sección, íconos antes que palabras, modales anchos en desktop (~90 vw, tope 1200 px), un acento y grises, recorrido entero.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `design-system/visual-refs/09-octubre-vista-principal.html` | crear: boceto de Fase 0 (recorrido completo, claro y oscuro, 1280 y 390 px) |
| `src/modules/project-workspace/WorkspaceHeader.tsx` | modificar: cabecera de una sola línea, sin pestañas |
| `src/modules/project-workspace/WorkspaceTabs.tsx` | modificar: quitar `shell`, `git`, `browser`; `files` sale de la cabecera |
| `src/modules/project-workspace/WorkspaceTitle.tsx`, `WorkspaceMain.tsx` | modificar: título + chips mínimos; panel de archivos a la derecha |
| `src/modules/usage-window/UsageWindowIndicator.tsx`, `UsageWindowPopover.tsx`, `CircleProgress.tsx` | modificar: nueva presentación de la cuota (la elige Leandro en el boceto) |
| `src/modules/cuentas/CuotaCuenta.tsx`, `AccountChip.tsx` | modificar: alinear con la nueva cuota |
| `src/modules/sidebar/SidebarHeader.tsx`, `SidebarCollapsed.tsx`, `SidebarContent.tsx`, `SidebarFooter.tsx`, `SidebarModeTabs.tsx`, `Sidebar.tsx` | modificar: riel de íconos + despliegue por cursor que empuja; sin refresh, sin filtro tmux, archivados en ⋯, nuevo proyecto junto a Ajustes |
| `src/modules/sidebar/hooks/useSidebarController.ts`, `useCompactSidebar.ts` | modificar: estado de despliegue por hover, anclado y móvil |
| `src/modules/chat/transcript/ProviderSelectionEmptyState.tsx` | modificar: sin texto; solo el selector discreto |
| `src/modules/chat/composer/ChatComposer.tsx`, `PromptInput.tsx`, `ComposerModelMenu.tsx`, `ComposerCuentaMenu.tsx`, `ComposerPermissionMenu.tsx` | modificar: compositor tipo Optimum |
| `src/modules/i18n/locales/{es,en}/chat.json` y `sidebar.json` | modificar: borrar las cadenas que ya no se usan |
| `server/modules/providers/list/claude/tmux-*.service.ts`, `src/modules/chat/hooks/useSessionStore.ts` | modificar **solo si** la Fase 1 prueba que el streaming de tmux falla ahí |
| `e2e/escenarios/vista-principal/*` | crear: capturas y comprobaciones de la vista nueva |

---

## Micro-tasks

- [x] Leer `apple-design` y `aos-dev:ui-ux-pro-max` y correr el generador de design system con «dashboard chat minimal developer tool» — acepta: salida guardada en `e2e/evidencia/09-vista-principal/00-ui-ux-pro-max.md` | valida: `test -s e2e/evidencia/09-vista-principal/00-ui-ux-pro-max.md`
- [ ] Capturar la vista actual en 1280 px y 390 px, claro y oscuro (línea base visual) — acepta: 4 PNG en `e2e/evidencia/09-vista-principal/00-antes/` | valida: `ls e2e/evidencia/09-vista-principal/00-antes/*.png | wc -l` da 4
- [x] Dibujar el boceto: estado en reposo (riel + chat vacío solo con compositor) — acepta: sección 1 del HTML | valida: abrir el archivo y verlo
- [x] Dibujar el boceto: barra desplegada por cursor empujando el chat — acepta: sección 2 con el riel y la barra abierta | valida: ídem
- [x] Dibujar el boceto: tres variantes de la cuota (anillo único, dos hilos finos, punto con valor) — acepta: tres variantes lado a lado con un criterio de color por estado | valida: ídem
- [x] Dibujar el boceto: panel de Archivos a la derecha, menú Ajustes con «Nuevo proyecto», «Archivados» y tema — acepta: secciones 4 y 5 | valida: ídem
- [x] Dibujar el boceto: versión móvil 390 px de todo el recorrido — acepta: sección 6 | valida: ídem
- [ ] Verificar que el HTML cumple REGLA 13 (texto mínimo, ⓘ por sección, un acento) — acepta: `grep -c "class=\"info\"" ≥ 6` y ninguna oración de más de 8 palabras fuera de un ⓘ | valida: script de chequeo en el paso 7 de la Fase 0
- [x] Mostrar el boceto a Leandro y registrar su decisión por `AskUserQuestion` — acepta: decisión escrita en `## Continuacion de Sesion` | valida: `grep -n "Boceto aprobado" plans/09-octubre-rediseno-vista-principal.md`
- [x] Reproducir «Nueva sesión» fallando (varias corridas) y dejar el patrón — acepta: informe con ≥ 10 intentos y la causa | valida: `test -s e2e/evidencia/09-vista-principal/01-nueva-sesion.md`
- [x] Medir si la barra se actualiza sola sin «Actualizar» (crear/cerrar sesión de tmux y cronometrar) — acepta: ≤ 5 s en 10 de 10 casos | valida: `node e2e/correr.mjs barra/sin-refresh`
- [x] Medir el streaming de una sesión de tmux real: muestras de texto por segundo en `:3901` y en `:3001` — acepta: informe con n de muestras y veredicto «en vivo / a saltos» | valida: `node e2e/correr.mjs tmux/en-vivo`
- [x] Quitar `shell`, `git` y `browser` de `WorkspaceTabs.tsx` y sacar `files` de la cabecera — acepta: la cabecera no tiene pestañas | valida: `NODE_ENV=test npx vitest run src/modules/project-workspace`
- [x] Implementar el panel de Archivos a la derecha (abre/cierra con ícono y atajo) — acepta: el árbol de archivos se abre en el panel sin cambiar de pestaña | valida: `node e2e/correr.mjs vista/panel-archivos`
- [x] Implementar la cuota según la variante aprobada — acepta: ya no dice «dato real» ni «resetea en…» a la vista; el detalle sale en el ⓘ/popover | valida: `NODE_ENV=test npx vitest run src/modules/usage-window`
- [x] Implementar el riel de íconos y el despliegue por cursor que empuja el chat — acepta: abre ≤ 150 ms tras entrar el cursor, cierra al salir, el chat no se desordena | valida: `node e2e/correr.mjs vista/barra-hover`
- [x] Sacar «Actualizar», filtro tmux y «Archivados» de la fila de botones; archivados queda en ⋯ — acepta: la barra tiene ≤ 3 controles visibles arriba | valida: `NODE_ENV=test npx vitest run src/modules/sidebar`
- [x] Mover «Nuevo proyecto» junto a Ajustes — acepta: botón visible al lado de Ajustes y abre el asistente | valida: `node e2e/correr.mjs vista/nuevo-proyecto`
- [x] Vaciar el estado vacío de texto y dejar el compositor tipo Optimum — acepta: ninguna de las 4 frases viejas está en el DOM | valida: `grep -rn "Elige tu asistente\|Listo para usar\|Pulsa" src/modules/i18n/locales/es` sin resultados
- [x] Corregir el streaming de tmux según el veredicto — acepta: texto creciendo en ≥ 3 muestras por turno y sin dos filas al final | valida: `node e2e/correr.mjs tmux/en-vivo` en verde
- [x] Reproducir cómo se llega al compositor vacío de un proyecto creyéndose en la orquestadora — acepta: causa o «no reproducido» con n ≥ 10 | valida: `test -s e2e/evidencia/09-vista-principal/07-destino-mensaje.md`
- [x] Mostrar «Sesión nueva en <proyecto>» con carpeta y cuenta en el compositor vacío — acepta: visible antes de enviar | valida: `node e2e/correr.mjs vista/destino-mensaje`
- [x] Devolver al cuadro el texto de un envío rechazado por `protocol_error` — acepta: test rojo sin el arreglo, verde con él | valida: `NODE_ENV=test npx vitest run src/modules/chat`
- [x] Agrupar la barra por proyecto (monograma, contador, peor estado al plegar) — acepta: cada sesión cuelga de su proyecto | valida: `NODE_ENV=test npx vitest run src/modules/sidebar`
- [x] Mostrar bajo la sesión madre los agentes que lanzó (línea de árbol, estado propio) — acepta: 3 agentes en paralelo aparecen bajo su madre y desaparecen al terminar | valida: `node e2e/correr.mjs vista/agentes-hijos`
- [x] Vista «Servicios»: puertos, app, exposición (Funnel/tailnet/local), RAM y disco — acepta: coincide con `ss -tlnH` y `tailscale serve status` | valida: `node e2e/correr.mjs vista/servicios`
- [x] Medidor completo en el popover de cuota (5 h, semanal, por cuenta, contexto, RAM, disco) — acepta: la cabecera muestra un solo anillo | valida: `NODE_ENV=test npx vitest run src/modules/usage-window`
- [ ] Pasada final: `typecheck`, `lint`, tests de cliente y de servidor, `build` — acepta: todo en verde | valida: `npm run typecheck && npm run lint:client && NODE_ENV=test npx vitest run && npm run build`
- [x] Capturas «después» (1280 y 390, claro/oscuro, `prefers-reduced-motion`) y comparación con el boceto — acepta: 8 PNG y informe lado a lado | valida: `ls e2e/evidencia/09-vista-principal/99-despues/*.png | wc -l` da 8

---

## Análisis Crítico

> Completado por Claude. Leandro decide qué incorporar antes de ejecutar.

### Incongruencias detectadas
- **Hover que empuja el chat vs. columna centrada.** Leandro eligió que la barra *empuje*. Cada vez que el cursor pasa por el borde izquierdo el chat se reacomoda; con la columna de lectura de `max-w-3xl` centrada, el texto se corre unos píxeles aunque no cambie de ancho. Mitigación en el plan: retardo de entrada de ~150 ms, salida con histéresis, y la barra se **ancla** con un clic. Si en el boceto se siente nervioso, se vuelve a preguntar flotante vs. empujar.
- **Quitar «Actualizar» antes de medir.** Se dejó explícito en Fase 1: si el automático no llega a 10 de 10, el botón no se saca hasta arreglarlo.
- **Quitar el filtro tmux supone que todo se ve igual.** La barra ya muestra el estado por sesión, pero el filtro «vivas» también servía para buscar solo entre ellas; ese caso queda cubierto por el buscador único (Ctrl+K).
- **Terminal.** Hoy es el plugin `cloudcli-plugin-terminal` (pestaña de plugin), no una pestaña propia. «Quitarla» = ocultar la pestaña de plugins y la de `shell`. El código y el plugin **no se borran**: queda detrás de un flag para poder volver.

### Huecos no cubiertos
- **Móvil.** Sin cursor no hay hover: en 390 px la barra sigue siendo un cajón con botón de menú. El boceto lo dibuja y la Fase 3 lo prueba.
- **Teclado y lector de pantalla.** Sin pestañas ni botones hay que dar ⌘/Ctrl atajos y `aria-label` a los íconos (riel, panel de archivos, cuota). Entra en la Fase 6.
- **Tareas y plugins.** Las pestañas `tasks` y las de plugins hoy cuelgan de la misma cabecera. Se propone que aparezcan **dentro de Ajustes** y del panel lateral, no en la cabecera. A confirmar en el boceto.
- **Selector de cuenta (chip `P`) y de modelo.** Los dos viven en el compositor y en la cabecera; el boceto decide cuál queda y cuál se pliega.

### Áreas relacionadas a monitorear
- `useSidebarController` y `useProjectsState`: la barra archiva sola (plan del 5-oct). No romper el registro de tmux ni el watcher al tocar los filtros.
- `UsageWindowIndicator` lo lee `servidor-code` y la statusline: **no cambiar el contrato de datos**, solo la presentación.
- Atajos y `CommandPalette`: `Ctrl+K` busca sesiones, archivos y commits; si «Git» desaparece de la cabecera, el buscador debe seguir sin esa fuente.
- Bundle: `scripts/bundle-budget.mjs` falla el build si el chunk crece; quitar pestañas ayuda, el panel de archivos no debe volver a cargarse en el chunk principal (plan `22-septiembre-bundle-carga-diferida.md`).

### Zonas intocables
- Toda la ruta de **mensajes y streaming headless** (`useSessionStore`, `chat-run-registry`): ya pasó 214 casos en el e2e del 6-oct. Solo se toca la parte de tmux y solo si la Fase 1 lo prueba.
- La **limpieza automática y el registro de sesiones** (`tmux-registry-sessions.service.ts`, `sessions-watcher.service.ts`): este plan cambia la barra por fuera, no la lógica por dentro.
- **Cuestionario / AskUserQuestion** y el flujo de permisos: no se toca su comportamiento, solo si el estilo del compositor los afecta.
- Credenciales, `auth.db`, servidor de producción (`:3001`) y sesiones que no sean de prueba (`e2e-*`).

### Sugerencias opcionales
- [ ] **Modo enfoque**: un atajo que esconde riel y cuota para leer (esfuerzo bajo, ~½ fase).
- [ ] **Ocultar «Consola» como título**: el logo se vuelve un ícono en el riel (esfuerzo bajo; incluido en el boceto si se aprueba).
- [ ] **Recordar el ancho del panel de archivos** por proyecto (esfuerzo bajo).
- [ ] **Vista de «Archivados» como página** dentro de Ajustes en vez de modo de la barra (esfuerzo medio; más limpio pero más trabajo).

---

## Fases

### Fase 0 - Boceto HTML y aprobación
**Goal (done-criterion):** Existe `design-system/visual-refs/09-octubre-vista-principal.html` con el recorrido completo (reposo, barra desplegada, tres variantes de cuota, panel de archivos, Ajustes, móvil; claro y oscuro) Y Leandro respondió «aprobado» por `AskUserQuestion` Y esa respuesta quedó escrita en `## Continuacion de Sesion`. Hasta entonces las Fases 2 a 6 no arrancan.
**Alcance:** Tocar: `design-system/visual-refs/09-octubre-vista-principal.html`, `e2e/evidencia/09-vista-principal/`. Ignorar: todo `src/` y `server/`.
**Paralelizable:** Sí - con la Fase 1; las dos no tocan los mismos archivos (una dibuja, otra mide).

#### Pasos
1. Invocar `apple-design` y `aos-dev:ui-ux-pro-max` (REGLA 13) y guardar la salida del generador de design system en `e2e/evidencia/09-vista-principal/00-ui-ux-pro-max.md`.
2. Partir de `05-octubre-header-barra.html` y `05-octubre-chat.html` (mismos tokens: acento `#3156FA`, grises, sans de sistema, claro/oscuro).
3. Dibujar el recorrido: (1) reposo con riel angosto y chat vacío con solo el compositor, (2) cursor sobre el riel: la barra se abre y el chat se corre, (3) respuesta en curso con la cuota visible, (4) panel de Archivos a la derecha, (5) menú de Ajustes con «Nuevo proyecto», «Archivados» y tema, (6) lo mismo a 390 px.
4. Mostrar **tres variantes** de la cuota, cada una con su ⓘ: anillo único con el % más alto; dos hilos finos; punto de color con el valor al pasar el cursor.
5. Cada sección con una etiqueta corta y un ⓘ; íconos de `lucide`, nada de emojis; un acento y grises, el color solo marca estado.
6. Springs `damping 1.0`, `prefers-reduced-motion` y `prefers-reduced-transparency` respetados en las animaciones del boceto.
7. Chequear el HTML con un script (contar ⓘ y buscar oraciones largas) y abrirlo en un navegador real a 1280 px y 390 px.
8. Mostrar el boceto a Leandro (link o Artifact) y pedir la decisión por `AskUserQuestion`: variante de cuota, qué pestañas viven en Ajustes, selector de cuenta/modelo, si el empuje de la barra se siente bien. Registrar la respuesta.

#### Estado (arranca todo en fail)
> Cierra solo cuando cada check pasó de `[fail]` a `[pass]` con validación real.
- [pass] El HTML existe y abre sin errores de consola (0 errores en Chromium headless, 10-oct) | valida: `node -e "require('fs').statSync('design-system/visual-refs/09-octubre-vista-principal.html')"` y captura sin errores
- [pass] Muestra las 6 escenas y las 3 variantes de cuota (9 `data-escena`, 3 variantes) | valida: `grep -c 'data-escena' design-system/visual-refs/09-octubre-vista-principal.html` ≥ 6 y `grep -c 'data-variante-cuota'` = 3
- [sin-verificar] Cumple REGLA 13 (≥ 6 ⓘ, un acento, ícono antes que palabra) | valida: script del paso 7 — 13 ⓘ contados; «un acento» e «ícono antes que palabra» no tienen comando
- [pass] Se ve bien a 1280 px y 390 px, claro y oscuro | valida: 4 capturas revisadas (`e2e/evidencia/09-vista-principal/00-boceto/`, las que Leandro vio al aprobar)
- [pass] Leandro aprobó (y eligió variante) | valida: `grep -n "Boceto aprobado" plans/09-octubre-rediseno-vista-principal.md`

#### Peligros
- Dibujar con texto de más «para explicar»: Leandro lo pidió explícitamente sin eso.
- Que el boceto tenga datos inventados de cuota: usar los de la captura (12 % / 83 %), no otros.

#### Mejores prácticas
- Mismas fuentes y tokens que el producto, para que el boceto no prometa algo que el código no puede dar.

---

### Fase 1 - Línea base y diagnóstico
**Goal (done-criterion):** Existen `e2e/evidencia/09-vista-principal/01-diagnostico.md` con tres veredictos medidos (Nueva sesión, barra sin «Actualizar», streaming de tmux) Y el informe lista, para cada uno, la causa o «no reproducido» con n de muestras.
**Alcance:** Tocar: `e2e/` (solo escenarios y evidencia). Ignorar: `src/` y `server/` (no se arregla nada acá).
**Paralelizable:** Sí - con la Fase 0; solo lee y mide.

#### Pasos
1. Levantar la instancia de prueba `:3901` con `e2e/instancia.mjs` y verificar que corre el mismo build que `:3001`.
2. «Nueva sesión»: 10 intentos desde la barra y desde el compositor; anotar cuáles fallan y qué ve la red/consola.
3. Barra: crear y cerrar sesiones de tmux por `orquestar.py` y cronometrar cuánto tarda en aparecer/desaparecer sin tocar «Actualizar».
4. Streaming de tmux: mandar un turno largo («contá del 1 al 40 de a uno por renglón») a una sesión de tmux y registrar cada cambio del DOM con marca de tiempo; contar muestras de texto y buscar la fila duplicada final.
5. Repetir el paso 4 contra `:3001` con el login de Leandro en una variable de entorno (nunca en pantalla), solo para esa corrida.
6. Escribir el informe con los tres veredictos y, si algo falla, el archivo y la línea probables.

#### Estado (arranca todo en fail)
- [pass] Instancia `:3901` arriba y con el mismo build | valida: `curl -s localhost:3901/health`
- [pass] Informe de «Nueva sesión» con ≥ 10 intentos | valida: `grep -c "intento" e2e/evidencia/09-vista-principal/01-diagnostico.md` ≥ 10
- [pass] Tiempo de aparición de la barra medido en ≥ 10 casos | valida: `node e2e/correr.mjs barra/sin-refresh`
- [pass] Streaming de tmux medido con n de muestras y veredicto (solo :3901; :3001 pendiente) | valida: `node e2e/correr.mjs tmux/en-vivo`
- [pass] Veredicto final redactado | valida: `test -s e2e/evidencia/09-vista-principal/01-diagnostico.md`

#### Peligros
- Tocar sesiones de Leandro: solo se usan las `e2e-*` y se verifica en el teardown que no queda ninguna.
- Contaminar el diagnóstico con una pestaña de bundle viejo: hard refresh antes de cada medición.

#### Mejores prácticas
- Un número y su n por cada afirmación. Sin n, «no reproducido» no vale.

---

### Fase 2 - Cabecera y cuota
**Goal (done-criterion):** La cabecera de `WorkspaceHeader.tsx` tiene una sola línea (título, un chip de cuenta, la cuota nueva y los íconos de Archivos y tema) sin pestañas de Terminal, Git ni Navegador Y el panel de Archivos se abre a la derecha Y los tests de `project-workspace` y `usage-window` pasan.
**Alcance:** Tocar: `src/modules/project-workspace/`, `src/modules/usage-window/`, `src/modules/cuentas/`, `src/modules/i18n/locales/*/` (solo cadenas de cabecera y cuota). Ignorar: `src/modules/sidebar/`, `src/modules/chat/`, `server/`.
**Paralelizable:** Sí - con las Fases 3 y 4; los archivos de cada una son disjuntos y cada una va en su worktree.

#### Pasos
1. Con la variante aprobada en Fase 0, quitar `shell`, `git`, `browser` de `BASE_TABS`/`BROWSER_TAB` en `WorkspaceTabs.tsx` y esconder las pestañas de plugins y `tasks` en la cabecera (van a Ajustes o al panel, según el boceto). Dejar el código detrás de un flag.
2. Reescribir `WorkspaceHeader.tsx`: sin el desplazador de pestañas, sin degradés de scroll; una fila con altura fija y material translúcido.
3. Mover `files` a un panel derecho en `WorkspaceMain.tsx` (carga diferida, con ícono y atajo, ancho recordado).
4. Reescribir `UsageWindowIndicator.tsx` y `UsageWindowPopover.tsx` con la variante aprobada: una presentación compacta, el detalle («dato real», «resetea en…») dentro del popover/ⓘ.
5. Quitar de `WorkspaceTitle.tsx` lo que no sea título + proyecto + chip de cuenta.
6. Actualizar los tests y borrar las cadenas muertas de i18n.

#### Estado (arranca todo en fail)
- [pass] Cabecera sin Terminal, Git ni Navegador | valida: `NODE_ENV=test npx vitest run src/modules/project-workspace`
- [pass] Panel de Archivos a la derecha abre y cierra | valida: `node e2e/correr.mjs vista/panel-archivos` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`
- [pass] Cuota nueva muestra ≤ 2 elementos visibles y el detalle en el popover | valida: `NODE_ENV=test npx vitest run src/modules/usage-window`
- [pass] Sin «dato real» ni «resetea en» a la vista | valida: captura 1280 px y 390 px — `vista/cabecera` en verde en escritorio y móvil, más `99-despues/`
- [fail] `typecheck` y `lint` del cliente en verde | valida: `npm run typecheck && npm run lint:client` — typecheck verde; lint con 1 error ajeno al plan (`src/shared/tests/websocketOutboundQueue.test.tsx:67`, `react(globals)`, viene de `0eca2a7b`)

#### Peligros
- Perder el acceso a algo que sí usa (tareas, plugins): confirmarlo en el boceto.
- Que el panel de archivos engorde el chunk inicial: carga diferida y `npm run build:client` (el presupuesto de bundle falla solo).

#### Mejores prácticas
- Springs críticamente amortiguados al abrir el panel, sin rebote; cross-fade si `prefers-reduced-motion`.

---

### Fase 3 - Barra lateral
**Goal (done-criterion):** Existe el riel de íconos con despliegue por cursor que empuja el chat (abre ≤ 150 ms, cierra al salir, se ancla con un clic) Y la barra ya no tiene «Actualizar», filtro tmux ni botón de «Archivados» visibles Y «Nuevo proyecto» está junto a Ajustes Y los tests de `sidebar` pasan.
**Alcance:** Tocar: `src/modules/sidebar/`, `src/modules/project-workspace/ProjectSidebarRegion.tsx`, cadenas de i18n de la barra. Ignorar: lógica de archivado y registro de tmux en `server/`, `src/modules/chat/`.
**Paralelizable:** Sí - con las Fases 2 y 4 (archivos disjuntos), **salvo** `ProjectSidebarRegion.tsx` que también toca la Fase 2: esa región la edita solo la Fase 3.

#### Pasos
1. Convertir `SidebarCollapsed.tsx` en el riel de íconos (logo, buscar, proyectos, Ajustes).
2. Agregar hover con retardo (~150 ms entrada, ~250 ms salida, histéresis) y anclado por clic en `useCompactSidebar.ts` / `useSidebarController.ts`; el chat se corre con la misma curva.
3. Limpiar `SidebarHeader.tsx`: sin «Actualizar», sin «Archivados» ni filtro tmux (`searchMode: 'running'`); el buscador único queda con `Ctrl+K`.
4. Esconder «Archivados» en un menú ⋯ de la barra (misma lógica de restaurar de hoy).
5. Mover «Nuevo proyecto» al pie junto a Ajustes (`SidebarFooter.tsx`).
6. Reducir el título «Consola» a un ícono en el riel; la barra abierta muestra solo la lista.
7. Si la Fase 1 dijo que «Nueva sesión» falla por un bug del cliente, arreglarlo acá; si es del servidor, abrir un pendiente en Norte con la causa.
8. Móvil: el cajón sigue funcionando con su botón de menú (sin hover).

#### Estado (arranca todo en fail)
- [pass] Riel de íconos visible y la barra se despliega por cursor | valida: `node e2e/correr.mjs vista/barra-hover` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/` (asoma en 200 ms medidos con margen de pintado)
- [pass] Sin «Actualizar», filtro tmux ni «Archivados» a la vista | valida: `NODE_ENV=test npx vitest run src/modules/skin` (la barra real vive en `skin/`, no en `sidebar/`)
- [pass] «Archivados» sigue accesible en ⋯ y restaura bien | valida: `node e2e/correr.mjs barra/restaurar-archivado` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`
- [pass] «Nuevo proyecto» junto a Ajustes abre el asistente | valida: `node e2e/correr.mjs vista/nuevo-proyecto` — verde el 10-oct (`corrida-2026-10-10-00-43/`)
- [pass] La barra sigue actualizándose sola tras los cambios | valida: `node e2e/correr.mjs barra/sin-refresh` — verde el 10-oct con `chatbotx-builder`/`worker` parados un rato para tener RAM (`corrida-2026-10-10-01-03/`): 10 de 10, entre 428 y 760 ms
- [pass] Móvil 390 px: el cajón abre y cierra | valida: captura y `node e2e/correr.mjs vista/barra-movil` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`

#### Peligros
- Hover con empuje: el chat se mueve al pasar el cursor por casualidad; si el boceto ya se sintió nervioso, volver a preguntar.
- Romper la reordenación de proyectos (`ReorderList`) al cambiar el contenedor.
- Cerrar la barra con una sesión de tmux pendiente de una pregunta: no cambia el estado, pero verificarlo.

#### Mejores prácticas
- Un solo buscador, estado de cada sesión visible sin abrir nada, nada de texto explicativo.

---

### Fase 4 - Estado vacío y compositor
**Goal (done-criterion):** El estado vacío no contiene ninguna de las cuatro frases viejas Y el compositor tiene la forma del de Optimum (píldora, una línea, controles plegados) Y los tests de `chat/composer` pasan.
**Alcance:** Tocar: `src/modules/chat/transcript/ProviderSelectionEmptyState.tsx`, `src/modules/chat/composer/`, `src/modules/i18n/locales/*/chat.json`. Ignorar: `useSessionStore`, transporte, `server/`.
**Paralelizable:** Sí - con las Fases 2 y 3 (archivos disjuntos).

#### Pasos
1. Reducir `ProviderSelectionEmptyState.tsx` a un selector discreto (si hay un solo proveedor, nada).
2. Reescribir `ChatComposer.tsx`/`PromptInput.tsx` como píldora con adjuntar y enviar; modelo, esfuerzo, cuenta y permisos plegados en un único popover.
3. Quitar la pista de `Ctrl+K` y el texto del `placeholder` largo; dejar uno corto.
4. Borrar de los i18n lo que ya no se usa.
5. Verificar adjuntos (pegar y arrastrar), `/` para comandos y `@` para archivos.

#### Estado (arranca todo en fail)
- [pass] Ninguna de las cuatro frases viejas en el DOM | valida: `grep -rn "Elige tu asistente\|Selecciona un proveedor\|Listo para usar\|Pulsa" src/modules/i18n/locales/es` sin resultados
- [pass] Compositor con ≤ 4 controles visibles | valida: `NODE_ENV=test npx vitest run src/modules/chat` (`tests/composerControles.test.tsx`)
- [pass] Adjuntos, `/` y `@` siguen funcionando | valida: `node e2e/correr.mjs vista/compositor` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`
- [pass] El indicador de actividad y la cola de mensajes siguen visibles | valida: `node e2e/correr.mjs tmux/rafaga` — verde el 10-oct con `chatbotx-builder`/`worker` parados un rato para tener RAM (`corrida-2026-10-10-01-03/`)

#### Peligros
- Esconder demasiado: «Opus · High» y la cuenta `P` deben seguir accesibles y a un clic.
- Romper el envío durante el turno en tmux (`chat.send-tmux`).

#### Mejores prácticas
- El borrador del compositor se conserva al cambiar de sesión (`chatDrafts`).

---

### Fase 5 - Streaming de tmux en tiempo real
**Goal (done-criterion):** El veredicto de la Fase 1 sobre tmux está cerrado: si estaba «a saltos», el texto crece en ≥ 3 muestras por turno sin duplicarse al final y `node e2e/correr.mjs tmux/en-vivo` pasa en `:3901` Y en `:3001`; si estaba «en vivo», existe un informe que lo prueba con n de muestras y la causa de la percepción de Leandro.
**Alcance:** Tocar: solo los archivos que el diagnóstico señale (esperables: `server/modules/providers/list/claude/tmux-pane-vivo.service.ts`, `tmux-bridge.service.ts`, `src/modules/chat/hooks/useSessionStore.ts` y los renderers de borrador). Ignorar: la ruta headless, el cuestionario y todo `src/modules/sidebar/`.
**Paralelizable:** No - depende del diagnóstico de la Fase 1; y toca el store de mensajes que las otras fases no tocan, pero no se arma el reparto hasta tener la causa.

#### Pasos
1. Leer `01-diagnostico.md` y reproducir con el escenario rojo antes de tocar nada.
2. Arreglar la causa mínima (frecuencia del lector del pane, id de borrador, reemplazo por JSONL) con un test que falle sin el arreglo.
3. Probar en `:3901` y luego en `:3001` (reinicio a cargo de Leandro).
4. Medir CPU del lector con 5 sesiones abiertas (`pidstat` 60 s).

#### Estado (arranca todo en fail)
- [pass] Escenario rojo reproducido antes del arreglo — no aplica: el veredicto de la Fase 1 fue «en vivo» en `:3901`, no hubo arreglo (`05-tmux-streaming.md`) | valida: `node e2e/correr.mjs tmux/en-vivo` en rojo, guardado en la evidencia
- [pass] Test unitario que falla sin el arreglo y pasa con él — no aplica, mismo motivo | valida: `npm test` y `NODE_ENV=test npx vitest run src/modules/chat`
- [pass] `tmux/en-vivo` pasa en `:3901` | valida: `node e2e/correr.mjs tmux/en-vivo` (corrida de la Fase 1, `01-diagnostico.md`)
- [fail] `tmux/en-vivo` pasa en `:3001` | valida: misma corrida, tras el reinicio de Leandro — pendiente de Leandro
- [fail] CPU del lector ≤ 5 % con 5 sesiones | valida: `pidstat -p $(pgrep -f cloudcli) 1 60` — 11,4 % de media con 6 sesiones, pero es el proceso entero de `:3001`, no el lector: tal como está escrito, no se cumple

#### Peligros
- Dos procesos escribiendo el mismo transcript si se retoma por el navegador una sesión enganchada en tmux: nunca desde la sesión de prueba.
- Re-introducir la fila duplicada que el plan del 5-oct ya había cerrado.

#### Mejores prácticas
- Un solo id por mensaje y un solo reemplazo del borrador.

---

### Fase 6 - Verificación final
**Goal (done-criterion):** `npm run typecheck`, `npm run lint:client`, `NODE_ENV=test npx vitest run`, `npm test` y `npm run build` terminan en verde Y existen 8 capturas «después» (1280/390 × claro/oscuro × con y sin `prefers-reduced-motion`) Y el informe compara el resultado con el boceto aprobado Y Leandro vio `:8446` rebuild + hard refresh.
**Alcance:** Tocar: `e2e/evidencia/09-vista-principal/99-despues/`, `design-system/` (README y tokens si cambiaron). Ignorar: todo lo demás.
**Paralelizable:** No - depende de las Fases 2 a 5 y 7.

#### Pasos
1. `npm run typecheck && npm run lint:client && NODE_ENV=test npx vitest run && npm test`.
2. `npm run build` (incluye el presupuesto de bundle).
3. Pedirle a Leandro que reinicie `cloudcli` desde `ct`/ttyd y haga hard refresh; esperar su OK.
4. Capturas «después» y comparación contra el boceto aprobado.
5. Pasada de accesibilidad: foco visible, `aria-label` en cada ícono, contraste ≥ 4.5:1, objetivos ≥ 44 px en móvil.
6. Actualizar `design-system/README.md` y `tokens.md` con lo que cambió.
7. Commit y push de `diseno/propio`, y borrar el worktree con `wt rm`.

#### Estado (arranca todo en fail)
- [fail] Typecheck, lint y tests en verde | valida: `npm run typecheck && npm run lint:client && NODE_ENV=test npx vitest run && npm test` — typecheck verde, vitest 847/847 (9-oct) más los 3 tests nuevos del 10-oct, `npm test` 928/939: los 10 rojos están en archivos que el plan no toca (`provider-cuenta.routes` con 409, nombres de sesión, `resolveClaudeCodeExecutablePath`); lint con el error ajeno de `websocketOutboundQueue.test.tsx`
- [pass] Build y presupuesto de bundle en verde | valida: `npm run build` — verde el 10-oct en la copia aislada y en `~/cloudcli` (1.596.497 bytes de 1.700.000), con los contenedores de chatbotx parados durante el build
- [pass] 8 capturas «después» y comparación con el boceto (`vista/capturas`, 10-oct; comparación en `## Cambios realizados`) | valida: `ls e2e/evidencia/09-vista-principal/99-despues/*.png | wc -l` da 8
- [fail] Leandro confirmó en `:8446` — pendiente: pide el build | valida: `AskUserQuestion` registrada
- [pass] Cambios commiteados y pusheados — `diseno/propio` avanzó por fast-forward a la rama y está en origin | valida: `git status --short` vacío y `git log origin/diseno/propio..HEAD` vacío

#### Peligros
- Reiniciar el servicio desde una terminal que cuelga de él: lo hace Leandro.
- Dar por bueno algo que solo pasa en `:3901`: la pasada final es en `:3001`.

#### Mejores prácticas
- Comparar contra el boceto aprobado, no contra el recuerdo.

### Fase 7 - Que se vea a dónde va cada mensaje
**Goal (done-criterion):** Con el compositor sin sesión abierta, la vista dice «Sesión nueva en <proyecto>» con la carpeta y la cuenta antes de enviar Y un mensaje rechazado por el server (`protocol_error`) vuelve al cuadro de texto en vez de quedar solo como «No se envió» Y existe la causa (o «no reproducido» con n de intentos) del clic que dejó la vista en «sesión nueva de optimum» creyéndose en la orquestadora Y los tests de `chat` pasan.
**Alcance:** Tocar: `src/modules/chat/hooks/useChatComposerState.ts`, `src/modules/chat/hooks/useChatRealtimeHandlers.ts`, `src/modules/chat/composer/`, `src/modules/chat/transcript/ProviderSelectionEmptyState.tsx`, `src/modules/skin/SkinSidebar.tsx` (solo si la causa está en la entrada fija), sus tests y `e2e/escenarios/vista/`. Ignorar: `server/`, el transporte de tmux.
**Paralelizable:** No - toca el compositor y el estado vacío de la Fase 4; va después de ella, sobre el diseño ya aprobado.

**Por qué existe (9-oct, verificado):** Leandro mandó el pedido de este rediseño creyendo que le escribía a la Session Orquestadora. El mensaje abrió una sesión nueva en `clientes/optimum` (`c6963869`, tmux `cloudcli-optimum-e40ab9b7`, nombre de `nombreTmux` y no de `orquestar.py`), con la cuenta de optimum y el `CLAUDE.md` de Optimum. La orquestadora (`56261920`) no recibió nada después de las 14:40 CEST. El compositor crea sesión cuando no tiene `selectedSession` ni `currentSessionId` (`useChatComposerState.ts:881`) y la crea en el proyecto seleccionado, sin decirlo. Además, los mensajes rechazados por `TMUX_PANE_VIVO` (arreglado en `cfc92e61`) solo vivían en la pestaña y se perdieron al recargar.

#### Pasos
1. Reproducir en `:3901` cómo se llega al compositor vacío de un proyecto desde la entrada fija o desde otra sesión: probar «+», clic en el nombre del proyecto, entrada fija con su proyecto colapsado, recarga en `/` y sesión archivada abierta. Dejar la causa o «no reproducido» con n.
2. En el estado vacío y en el placeholder: «Sesión nueva en <proyecto>», con la carpeta y la cuenta que va a usar (`cuenta para <dir>`).
3. Si la causa del paso 1 es un bug de navegación, arreglarlo con un test que falle sin el arreglo.
4. `protocol_error` de un envío: devolver el texto y los adjuntos al cuadro si está vacío, como ya hace `failSend` con los errores locales.
5. Escenario e2e `vista/destino-mensaje`.

#### Estado (arranca todo en fail)
- [pass] Causa del clic o «no reproducido» con n ≥ 10 — «no reproducido» con n=10 (2 vueltas × 5 caminos de `vista/destino-mensaje`, 10-oct): ningún camino deja el compositor vacío sin la línea, y `/` sin proyecto no tiene compositor | valida: `test -s e2e/evidencia/09-vista-principal/07-destino-mensaje.md`
- [pass] El compositor vacío dice el proyecto y la cuenta antes de enviar | valida: `node e2e/correr.mjs vista/destino-mensaje` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`
- [pass] Un `protocol_error` devuelve el texto al cuadro (rojo antes del arreglo, verde después, en `messageDeliveryStatus.test.tsx`) | valida: `NODE_ENV=test npx vitest run src/modules/chat` con un test que falla sin el arreglo
- [pass] Sin regresión en el envío por tmux | valida: `node e2e/correr.mjs tmux/rafaga` — verde el 10-oct con `chatbotx-builder`/`worker` parados un rato para tener RAM (`corrida-2026-10-10-01-03/`): 5 mensajes, cada uno 1 vez en JSONL y DOM, un solo proceso

#### Peligros
- Devolver el texto a un cuadro donde Leandro ya empezó a escribir otro: solo si está vacío.
- Que el aviso se vuelva ruido: una línea, no un cartel.

#### Mejores prácticas
- El destino se lee del mismo lugar que usa el envío (`resolvedProjectPath`, `cuentaDeLaSesionNueva`), no se recalcula aparte.

---

### Fase 8 - Proyectos, agentes hijos, servicios y medidor
**Goal (done-criterion):** La barra agrupa sesiones por proyecto Y las sesiones que lanzan agentes los muestran debajo Y existe la vista «Servicios» con los puertos reales del VPS Y el popover de cuota trae el medidor completo Y los tests de `sidebar` y `usage-window` pasan.
**Alcance:** Tocar: `src/modules/sidebar/`, `src/modules/usage-window/`, una vista nueva `src/modules/servicios/`, y un endpoint de solo lectura en `server/` (puertos, RAM, disco). Ignorar: logica de archivado y transporte.
**Paralelizable:** No - comparte la barra con la Fase 3; va despues de ella.

#### Pasos
1. Averiguar de donde sale la relacion madre-hija (transcripts de subagentes, `orquestar.py`, registro de sesiones) y dejarlo escrito antes de dibujar nada.
2. Agrupar por proyecto: monograma, contador y estado mas urgente al plegar.
3. Arbol de hijas bajo la madre, con estado propio y limite visual de 7.
4. Endpoint de solo lectura: `ss -tlnH`, `tailscale serve status`, `free`, `df`. Sin acciones de escritura en esta fase.
5. Vista «Servicios» agrupada por exposicion; el puerto sin servicio se marca «sin nombre».
6. Medidor: lo que hoy esta en la cabecera pasa al popover; RAM y disco suben a la cabecera solo sobre 85 %.

#### Estado (arranca todo en fail)
- [pass] Sesiones agrupadas por proyecto | valida: `NODE_ENV=test npx vitest run src/modules/skin` (`skinSidebarProyectos.test.tsx`)
- [pass] Hijas visibles bajo la madre | valida: `node e2e/correr.mjs vista/agentes-hijos` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`. El escenario encontró un bug real: la barra solo miraba la tool `Task` y Claude Code la llama `Agent` (arreglado en `1995ddcf`)
- [pass] Servicios coincide con el sistema | valida: `node e2e/correr.mjs vista/servicios` — verde el 10-oct con la interfaz servida por `vite` dev (`E2E_URL_UI`), corridas `e2e/evidencia/corrida-2026-10-10-00-44/` y `-00-50/`; el parser de `ss`/`tailscale serve` en verde en `servicios.service.test.ts`
- [pass] Medidor completo y un solo anillo en cabecera (se hizo en la Fase 2) | valida: `NODE_ENV=test npx vitest run src/modules/usage-window`

#### Peligros
- La relacion madre-hija puede no estar registrada hoy: si no existe, el paso 1 abre un pendiente y el arbol espera.
- Mostrar el endpoint de servicios fuera del tailnet: queda detras del login de CloudCLI.

---

## Orden de ejecución

1. **Fases 0 y 1 en paralelo** (una dibuja, otra mide; no tocan los mismos archivos).
2. **Compuerta: Leandro aprueba el boceto.** Sin eso no sigue nada.
3. **Fases 2, 3 y 4 en paralelo**, cada una en su worktree (`wt new`), con una única dueña de `ProjectSidebarRegion.tsx` (Fase 3).
4. **Fase 5** cuando la Fase 1 haya dejado el veredicto (puede correr en paralelo con 2-4 si no toca los mismos archivos; el reparto se decide ahí).
5. **Fase 7** después de la Fase 4 (mismos archivos del compositor).
6. **Fase 6** al final, secuencial.

Cuota: 3 fases en paralelo es el máximo razonable (REGLA 7/9). Si `7d >= 60%` no se paraleliza.

## Verificación final

`npm run typecheck && npm run lint:client && NODE_ENV=test npx vitest run && npm test && npm run build`, más las 8 capturas «después» y la confirmación de Leandro en `https://leandro-servidor.taila8c262.ts.net:8446` tras reinicio y hard refresh.

## Riesgos globales

- **El gusto de Leandro cambia al ver el HTML** (ya pasó con la cuota y el cuestionario): por eso el boceto es compuerta dura y no un trámite.
- **Varias sesiones sobre `~/cloudcli`:** hay otras dos sesiones vivas en el repo; el trabajo va en worktree y se hace `git pull` antes de cada fase.
- **El cambio visual esconde una regresión funcional** (atajos, sesión en espera de pregunta): cada fase cierra con un escenario e2e, no con la vista.

---

## Cambios realizados

Rama `rediseno-vista-principal` (worktree `~/worktrees/cloudcli/rediseno-vista-principal`), 9 y 10-oct, en la cuenta optimum, en secuencia y sin subagentes:

- `9dd73808` **Fase 2:** cabecera de una línea con un anillo de cuota (`UsageWindowIndicator`), el medidor completo en `UsageWindowPopover` y `SkinMedidorExtra`, RAM y disco solo sobre 85 % (`SkinRecursos soloSiAlto`), y el panel de Archivos a la derecha.
- `efe01db6` **Fase 3:** riel de 52 px que asoma con el cursor (150 ms al entrar, 250 ms al salir) y se fija con el logo, y menú de Ajustes con Archivados, Tareas, Plugins, Tema y Ajustes. Salen «Consola», el filtro tmux, «Archivados» y «Actualizar». «Nuevo proyecto» va al pie, y el 409 de «Nueva sesión» muestra el mensaje del servidor (`errorDeCreacion.ts`).
- `33d9d338` **Fase 4:** estado vacío sin texto (solo `NextTaskBanner` si hay tareas). Compositor de cuatro controles: cuenta, permisos, modelo y esfuerzo plegados en un menú. Placeholder «Escribe…».
- `3d95a800` **Fase 7:** el compositor dice «Sesión nueva en <proyecto> · <cuenta>» antes de enviar. Un rechazo que no pudo tipear (todo lo que no sea `PANE_SEND_UNCONFIRMED`/`TMUX_SEND_FAILED`) devuelve el texto al cuadro.
- `c2a659aa` **Fase 8:** monograma por proyecto, peor estado y contador al plegar. Subagentes vivos como filas hijas (máx. 7 + «+N más»). Vista Servicios (diálogo desde Ajustes) sobre `GET /api/system/servicios` (`ss -tlnpH` + `tailscale serve status`, detrás de `authenticateToken`).
- `662d114b` **Tras la revisión de Leandro (10-oct):**
  - **La barra arrancaba fija:** se notó al mirar `:8446`. El riel y el hover existían, pero `skinUiStore` arrancaba con la barra abierta salvo que alguien la hubiera plegado, así que nunca se veía el riel. Ahora en reposo es el riel, y fijarla con el logo se guarda en `skin:barra-fijada`; la clave vieja se ignora a propósito. Test `skinUiStoreReposo.test.ts`, que falla con el default viejo, y check nuevo en `vista/barra-hover` («sin preferencias guardadas, la barra arranca en el riel»).
  - **Servicios, contra la escena 8 del boceto:** RAM y disco arriba, y un clic abre el servicio por su entrada del tailnet (`abrirEn`). El menú ⋯ de reiniciar o ver el log queda fuera: la Fase 8 es de solo lectura.
- `1995ddcf` **Fase 6 (10-oct):** dos bugs que encontraron los e2e:
  - La barra solo leía la tool `Task`, y Claude Code hoy la llama `Agent`: sin el arreglo no aparecía ninguna fila hija.
  - Con la RAM alta, la cabecera subía también el disco al 44 %.
  - Además: `E2E_URL_UI` en el arnés, escenarios corregidos y las 8 capturas en `e2e/evidencia/09-vista-principal/99-despues/`.

**Cómo se corrieron los e2e sin build:** `vite build` no entra en la RAM del VPS. La instancia de prueba corre solo con `build:server`, y la interfaz la sirve `vite` en dev (unidad transitoria `e2e-rvp-vite`, `:3920`, proxy a `:3912`). `E2E_URL_UI=http://localhost:3920` apunta el navegador ahí sin el cambio de modo de `CLOUDCLI_URL`.

**Comparación con el boceto:** coinciden cabecera de una fila con un anillo, riel que empuja el chat, Ajustes con todo lo plegado, compositor de una píldora y estado vacío sin texto. Lo que no estaba en el boceto y aparece en las capturas es la lengüeta de Quick Settings a la derecha (`QuickSettingsHandle`). Es anterior al plan, pero en 390 px se come ~48 px del chat: queda como candidata a un plan aparte.

**Desvíos del plan:**
- La barra real vive en `src/modules/skin/`, no en `src/modules/sidebar/`: los `valida:` de sidebar se corrieron sobre `skin`.
- La relación madre-hija de la Fase 8 sale de los subagentes vivos (`subagentStore`), no de `orquestar.py`: las sesiones del orquestador son de tmux y no registran madre.
- Servicios es un diálogo y no una pestaña.
- El paso 4 de la Fase 8 (`free`/`df` en el endpoint) no se hizo: RAM y disco ya llegan por `SkinRecursos`.
- Fase 5: sin código, el veredicto fue «en vivo».

**Un accidente:** el commit `bcd4ce78` dejó este plan en 89 líneas. El script que lo actualizó cortó en la primera aparición de `## Continuacion de Sesion`, que también está dentro de una micro-task. Se reconstruyó desde `c122e795` en el commit siguiente.

---

## Continuacion de Sesion

**Fases completadas:**
- 0, 1, 2, 3, 4, 7 y 8, con sus e2e de la vista en verde (10-oct).
- La 5 sin código de por medio (veredicto «en vivo» en `:3901`).
**Fase actual:** 6 (verificación final): solo falta el reinicio y la confirmación de Leandro.
**Proximo paso exacto:**
1. `~/cloudcli` ya está compilado en `662d114b`. Leandro corre `systemctl --user restart cloudcli` desde `ct`/ttyd (no desde una terminal de CloudCLI) y hace hard refresh en `:8446`.
2. Leandro confirma.
3. `tmux/en-vivo` contra `:3001` (pide `CLOUDCLI_USER`/`CLOUDCLI_PASS` en el entorno).
4. `wt rm rediseno-vista-principal`.
**Bloqueantes:** ninguno propio del plan. El error de lint de `websocketOutboundQueue.test.tsx` y los 10 rojos de `npm test` son anteriores y ajenos; el check de la Fase 6 los nombra.
**Micro-tasks pendientes:** 1 de 28 (la pasada final, por el lint y los tests ajenos).
**RAM (10-oct):** se repitió una vez más para el build de `662d114b` (respaldo `respaldo-chatbotx2`, cancelado).
**RAM (10-oct):** para el build y las pruebas de tmux se pararon `chatbotx-builder-1` y `chatbotx-worker-1` (~2,3 GB) con autorización de Leandro, y se volvieron a levantar (había un timer de respaldo `respaldo-chatbotx` a los 45 min, cancelado).
**Decisiones de Leandro (9-oct):** la barra **empuja** el chat; el streaming que falla es el de **tmux**; ejecutar todo el plan seguido, en la cuenta optimum, aceptando el corte por cuota.

**Boceto aprobado (9-oct):** Leandro aprobó el boceto «tal cual», con las escenas 1-9. Cuota: **variante A (anillo)**. La barra empuja el chat; Tareas, Plugins, Archivados y Tema viven en Ajustes; Servicios y el medidor completo se agregan como Fase 8.
**Cerradas antes:** Fase 0 (boceto aprobado) y Fase 1 (`e2e/evidencia/09-vista-principal/01-diagnostico.md`).
