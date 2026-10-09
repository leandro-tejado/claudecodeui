# Rediseño de la vista principal de CloudCLI: cabecera, barra lateral y compositor

**Fecha:** 09 de Octubre 2026
**Estado:** en-ejecucion (código de las Fases 2, 3, 4, 7 y 8 commiteado; e2e, build y confirmación en `:8446` pendientes)

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

- [ ] Leer `apple-design` y `aos-dev:ui-ux-pro-max` y correr el generador de design system con «dashboard chat minimal developer tool» — acepta: salida guardada en `e2e/evidencia/09-vista-principal/00-ui-ux-pro-max.md` | valida: `test -s e2e/evidencia/09-vista-principal/00-ui-ux-pro-max.md`
- [ ] Capturar la vista actual en 1280 px y 390 px, claro y oscuro (línea base visual) — acepta: 4 PNG en `e2e/evidencia/09-vista-principal/00-antes/` | valida: `ls e2e/evidencia/09-vista-principal/00-antes/*.png | wc -l` da 4
- [ ] Dibujar el boceto: estado en reposo (riel + chat vacío solo con compositor) — acepta: sección 1 del HTML | valida: abrir el archivo y verlo
- [ ] Dibujar el boceto: barra desplegada por cursor empujando el chat — acepta: sección 2 con el riel y la barra abierta | valida: ídem
- [ ] Dibujar el boceto: tres variantes de la cuota (anillo único, dos hilos finos, punto con valor) — acepta: tres variantes lado a lado con un criterio de color por estado | valida: ídem
- [ ] Dibujar el boceto: panel de Archivos a la derecha, menú Ajustes con «Nuevo proyecto», «Archivados» y tema — acepta: secciones 4 y 5 | valida: ídem
- [ ] Dibujar el boceto: versión móvil 390 px de todo el recorrido — acepta: sección 6 | valida: ídem
- [ ] Verificar que el HTML cumple REGLA 13 (texto mínimo, ⓘ por sección, un acento) — acepta: `grep -c "class=\"info\"" ≥ 6` y ninguna oración de más de 8 palabras fuera de un ⓘ | valida: script de chequeo en el paso 7 de la Fase 0
- [ ] Mostrar el boceto a Leandro y registrar su decisión por `AskUserQuestion` — acepta: decisión escrita en `## Continuacion de Sesion

**Fases completadas:** 0, 1, 2, 3, 4 y 8 en código y tests unitarios. La 5 queda sin cambios de código (veredicto «en vivo»). La 7 está en código con el `protocol_error` verificado.
**Fase actual:** 6 (verificación final), frenada por el build.
**Proximo paso exacto:**
1. Con RAM libre (o en la notebook), correr `npm run build` en esta rama.
2. Con el bundle, levantar la instancia aislada (`scratchpad/e2e-env.sh`: `E2E_PUERTO_BASE=3910`) y correr los escenarios de `e2e/escenarios/vista/` más `barra/restaurar-archivado`, `barra/sin-refresh` y `tmux/rafaga`.
3. Tomar las 8 capturas en `e2e/evidencia/09-vista-principal/99-despues/`.
4. Mergear a `diseno/propio`. Leandro hace `npm run build && systemctl --user restart cloudcli` desde `ct`/ttyd, hard refresh en `:8446`, y confirma. Ahí se corre `tmux/en-vivo` contra `:3001`.
5. Actualizar `design-system/README.md`, y `wt rm rediseno-vista-principal`.
**Bloqueantes:** RAM del VPS para `vite build`. El error de lint de `websocketOutboundQueue.test.tsx` y los 10 rojos de `npm test` son anteriores al plan, pero frenan el check de la Fase 6 tal como está escrito.
**Micro-tasks pendientes:** 14 de 28.
**Decisiones de Leandro (9-oct):** la barra **empuja** el chat; el streaming que falla es el de **tmux**; ejecutar todo el plan seguido, en la cuenta optimum, aceptando el corte por cuota.

**Boceto aprobado (9-oct):** Leandro aprobó el boceto «tal cual», con las escenas 1-9. Cuota: **variante A (anillo)**. La barra empuja el chat; Tareas, Plugins, Archivados y Tema viven en Ajustes; Servicios y el medidor completo se agregan como Fase 8.
**Cerradas antes:** Fase 0 (boceto aprobado) y Fase 1 (`e2e/evidencia/09-vista-principal/01-diagnostico.md`).
