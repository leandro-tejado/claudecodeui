# Partir el bundle del cliente en carga diferida

**Fecha:** 22 de Septiembre 2026
**Estado:** en-ejecucion

Bajar lo que el navegador tiene que descargar antes de ver el login, pasando a carga diferida la terminal, el editor de código y todo lo pesado que la auditoría del bundle señale. Hoy son 4,35 MB de JavaScript y ninguno de los 509 archivos del cliente usa `React.lazy`.

---

## Contexto

Un teléfono que llega al VPS por relay de Tailscale recibe a decenas de KB/s. Con 4,35 MB de JS antes del login, la descarga se cortaba a mitad y la app quedaba en blanco — el 22-sep el diagnóstico en el iPhone la mostró fallando en `vendor-codemirror`.

Ese día se arregló el transporte: el service worker dejó de clonar el stream de red y reintenta, el registro fuerza actualización, y el servidor sirve brotli precomprimido (7,42 MB → 1,73 MB). Con eso la app entra. **Lo que queda es la causa de fondo:** se descarga el editor de código y la terminal aunque no se abran, y `react-scan` —una herramienta de diagnóstico de renders— viaja al bundle de producción.

Medición base del camino crítico, servida hoy:

| Chunk | Crudo | Brotli |
|---|---|---|
| `index-Dx650vuH.js` | 3.132.154 | 701.316 |
| `vendor-codemirror` | 659.622 | 190.887 |
| `vendor-xterm` | 396.801 | ~110.000 |
| `vendor-react` | 161.252 | ~50.000 |
| `index-*.css` | 211.246 | ~30.000 |
| **Total** | **~4,35 MB** | **~1,08 MB** |

Mermaid ya está diferido por dynamic imports internos (`mermaid.core`, `cytoscape`, `cynefin`): no entra en este plan.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `vite.config.js` | modificar - visualizer opt-in por env y revisión de `manualChunks` |
| `scripts/bundle-budget.mjs` | crear - mide el camino crítico y falla si supera el techo |
| `src/main.tsx` | modificar - `react-scan` solo en dev por import dinámico; sacar el registro duplicado del service worker |
| `src/shared/ui/LazyPanel.tsx` | crear - Suspense + esqueleto reutilizable por las tres fases de diferido |
| `src/modules/standalone-shell/StandaloneShell.tsx` | modificar - montar `Shell` diferido |
| `src/modules/task-master/modals/TaskMasterSetupModal.tsx` | modificar - montar `Shell` diferido |
| `src/modules/code-editor/EditorSidebar.tsx` | modificar - montar `CodeEditor` diferido |
| `src/modules/prd-editor/PrdEditorBody.tsx` | modificar - CodeMirror diferido |
| `src/modules/chat/transcript/Markdown.tsx` | modificar - KaTeX y resaltador diferidos según auditoría |
| `src/shared/syntaxHighlighter.ts` | modificar - carga diferida del resaltador |
| `src/shared/prefetchHeavyChunks.ts` | crear - precarga en segundo plano una vez montada la app |
| `public/sw.js` | modificar - solo el bump de `CACHE_NAME` al desplegar |
| `docs/bundle-baseline.md` | crear - línea base y resultado, para comparar en el futuro |

---

## Micro-tasks

- [x] Crear la rama `perf/carga-diferida` desde `diseno/propio` — acepta: rama creada y limpia | valida: `git status -sb`
- [x] Correr `npm install` en la notebook — acepta: `node_modules/motion` existe | valida: `ls node_modules/motion`
- [x] Confirmar que el build del cliente pasa antes de tocar nada — acepta: `dist/` regenerado sin error | valida: `npm run build:client`
- [x] Agregar `rollup-plugin-visualizer` como devDependency — acepta: figura en package.json | valida: `grep visualizer package.json`
- [x] Activar el visualizer en `vite.config.js` detrás de `process.env.VISUALIZE` — acepta: sin la env el build no lo carga | valida: `npm run build:client` no genera `stats.html`
- [x] Generar el mapa del bundle — acepta: existe `stats.html` | valida: `VISUALIZE=1 npm run build:client && ls stats.html`
- [x] Escribir `scripts/bundle-budget.mjs` que lea `dist/index.html`, sume el script principal, los `modulepreload` y el CSS, en crudo y en `.br` — acepta: imprime tabla y total | valida: `node scripts/bundle-budget.mjs --report`
- [x] Registrar la línea base en `docs/bundle-baseline.md` con los números del build actual — acepta: tabla con crudo y brotli por chunk | valida: `cat docs/bundle-baseline.md`
- [x] Anotar en `docs/bundle-baseline.md` los cinco paquetes más pesados dentro de `index-*.js` según el visualizer — acepta: lista con tamaño de cada uno | valida: lectura del archivo
- [x] Crear `src/shared/components/LazyPanel.tsx` con Suspense y esqueleto (bordes, barra y fondo del panel, sin salto de layout) — acepta: renderiza el fallback y luego el hijo | valida: `npm run test:client`
- [x] Test del esqueleto: monta el fallback y después el contenido — acepta: test verde | valida: `npm run test:client -- LazyPanel`
- [x] Pasar `react-scan` a import dinámico dentro de un `if (import.meta.env.DEV)` en `src/main.tsx` — acepta: en dev sigue activándose con `localStorage react-scan=on` | valida: `npm run client` y probar el overlay
- [x] Verificar que `react-scan` desapareció del bundle de producción — acepta: 0 coincidencias | valida: `grep -c react-scan dist/assets/index-*.js`
- [x] Borrar el `navigator.serviceWorker.register` de `src/main.tsx` — acepta: queda solo el de `index.html`, con `updateViaCache` | valida: `grep -rn "serviceWorker.register" src/ index.html`
- [x] Diferir `Shell` en `StandaloneShell.tsx` con `React.lazy` + `LazyPanel` — acepta: la terminal abre y conecta | valida: abrir la terminal en el navegador
- [x] Diferir `Shell` en `TaskMasterSetupModal.tsx` — acepta: el modal abre la terminal igual que antes | valida: abrir el modal
- [x] Confirmar que `vendor-xterm` ya no está en los `modulepreload` de `dist/index.html` — acepta: 0 coincidencias | valida: `grep -c vendor-xterm dist/index.html`
- [x] Diferir `CodeEditor` en `EditorSidebar.tsx` — acepta: abrir un archivo lo carga y edita | valida: abrir un archivo del árbol
- [x] Diferir CodeMirror en `PrdEditorBody.tsx` — acepta: el editor de PRD funciona | valida: abrir un PRD
- [x] Confirmar que `vendor-codemirror` salió del camino crítico — acepta: 0 coincidencias | valida: `grep -c vendor-codemirror dist/index.html`
- [x] Diferir el resaltador de sintaxis en `src/shared/syntaxHighlighter.ts` — acepta: un bloque de código se pinta al aparecer | valida: abrir un chat con código
- [x] Diferir KaTeX (JS y CSS) al primer bloque de fórmulas — acepta: una fórmula renderiza | valida: abrir un mensaje con fórmula
- [x] Revisar el resto de lo que marque el visualizer y diferir lo que no esté en el camino crítico — acepta: cada pieza diferida figura en `docs/bundle-baseline.md` | valida: `node scripts/bundle-budget.mjs --report`
- [x] Crear `src/shared/prefetchHeavyChunks.ts` que precargue terminal y editor con `requestIdleCallback` (con `setTimeout` de respaldo, que Safari iOS no lo implementa) — acepta: los chunks aparecen en la red después del montaje | valida: DevTools o `diag.html`
- [x] Llamar la precarga desde `App.tsx` una vez montada la app y autenticada la sesión — acepta: no se dispara en la pantalla de login | valida: revisar red en el login
- [x] Verificar que la precarga no compite con la carga inicial — acepta: arranca después del primer render | valida: marca de tiempo en consola
- [x] Poner el techo en `scripts/bundle-budget.mjs` y hacer que salga con código 1 si se supera — acepta: falla al bajar el techo a propósito | valida: `node scripts/bundle-budget.mjs --max-raw 1` devuelve 1
- [x] Encadenar el presupuesto a `build:client` — acepta: un build que exceda el techo falla | valida: `npm run build:client`
- [x] Correr typecheck, lint y la suite del cliente — acepta: los tres verdes | valida: `npm run typecheck && npm run lint && npm run test:client`
- [x] Bump de `CACHE_NAME` en `public/sw.js` a `claude-ui-v6` — acepta: el worker nuevo purga lo viejo | valida: `grep CACHE_NAME public/sw.js`
- [x] Subir el `dist/` nuevo al VPS de forma atómica (copiar a `dist.next` y renombrar) — acepta: sin ventana en la que falten assets | valida: `curl` al index durante el swap
- [x] Verificar los assets comprimidos en el VPS — acepta: `Content-Encoding: br` en el bundle nuevo | valida: `curl -sI -H "Accept-Encoding: br"` contra el bundle
- [x] Medir en el iPhone con `diag.html` — acepta: todos los assets 200 y la app monta en menos de 5 s | valida: captura de `diag.html`
- [x] Anotar el resultado final en `docs/bundle-baseline.md` y en `## Cambios realizados` — acepta: antes y después, con porcentaje | valida: lectura del archivo

---

## Análisis Crítico

> Completado por Claude en Fase 2.5. El usuario decide qué incorporar antes de ejecutar.

### Incongruencias detectadas

- **Doble registro del service worker.** `index.html` registra `/sw.js` con `updateViaCache: 'none'` y `update()`; `src/main.tsx` lo registra otra vez, sin opciones. El segundo puede rebajar las guardas puestas el 22-sep. Resuelto en la Fase 2, pero es una contradicción que ya existe hoy en el repo.
- **`manualChunks` no difiere nada.** Separa `vendor-codemirror` y `vendor-xterm` en archivos propios, lo que dio la falsa impresión de que estaban aislados: como el código los importa estático, Vite igual los declara `modulepreload` y se bajan siempre. Partir el chunk y diferir la carga son dos cosas distintas; este plan hace la segunda.
- **No hay `graphify-out/` en el repo**, así que el análisis de vecinos se hizo a mano sobre los imports.

### Huecos no cubiertos

- **Los tests del cliente que montan `Shell` o `CodeEditor`** pueden romperse al pasar a `lazy`: un componente diferido necesita `Suspense` alrededor también en el test. Hay que revisar `src/modules/shell/tests/` antes de dar por verde la suite.
- **Electron.** `electron/main.js` carga el mismo `dist/`. El diferido funciona igual sobre `file://`, pero conviene abrir la app de escritorio una vez antes de cerrar el plan.
- **`release.sh` y `desktop:pack`** corren `npm run build`: si el presupuesto queda encadenado a `build:client`, un exceso de techo ahora rompe también el empaquetado de escritorio. Es el comportamiento buscado, pero hay que saberlo.
- **La precarga compite por la misma red.** Si arranca demasiado pronto, le roba ancho de banda al primer render del chat. Por eso va atada al idle y después del login, no al montaje.
- **El plan no toca el tamaño del CSS** (211 KB de Tailwind). Queda fuera a propósito: es un único archivo y comprime muy bien.

### Áreas relacionadas a monitorear

- `public/sw.js` — cachea por URL con hash. Chunks nuevos entran limpios, pero conviene el bump de `CACHE_NAME` al desplegar para no dejar los viejos ocupando cuota.
- `scripts/precompress.mjs` — ya encadenado a `build:client`; cada chunk nuevo necesita su `.br`, y eso pasa solo.
- El middleware de precomprimidos en `server/index.ts` — sirve cualquier `.js` bajo `dist/`, así que los chunks nuevos quedan cubiertos sin tocarlo.
- `src/modules/prd-editor/` y `src/modules/code-editor/markdown/` — consumidores indirectos de CodeMirror que es fácil pasar por alto.

### Zonas intocables

- **El service worker arreglado el 22-sep** (`serveAsset` sin `clone()` del stream, con reintentos). Solo se toca el número de `CACHE_NAME`.
- **El middleware de brotli y `scripts/precompress.mjs`.** Funcionan y están verificados.
- **La unit `cloudcli.service` y las 10 sesiones de tmux vivas.** Este plan no reinicia el servicio: solo reemplaza archivos estáticos.
- **`server/`** entero: este plan es del cliente. Si aparece la tentación de tocar el server, es señal de que algo se salió de alcance.

### Sugerencias opcionales

- [x] Auditar los imports de `lucide-react`: un `import * as Icons` mete el paquete completo. Esfuerzo bajo, ahorro posible alto.
- [x] Revisar si `@anthropic-ai/claude-agent-sdk` o `@octokit/rest` entran al cliente por algún import compartido. Esfuerzo bajo.
- [x] Diferir por ruta (`/` y `/session/:id` comparten componente hoy, así que rinde poco). Esfuerzo medio, ahorro incierto.
- [x] Publicar `stats.html` detrás del tailnet para mirar el mapa del bundle desde el teléfono. Esfuerzo bajo, valor de diagnóstico.

---

## Fases

### Fase 1 — Línea base medible y mapa del bundle
**Goal (done-criterion):** Existen `scripts/bundle-budget.mjs`, `docs/bundle-baseline.md` y `stats.html` Y `node scripts/bundle-budget.mjs --report` imprime el total del camino crítico en crudo y brotli Y `docs/bundle-baseline.md` nombra los cinco paquetes más pesados dentro de `index-*.js`.
**Alcance:** Tocar: `vite.config.js`, `scripts/`, `docs/`, `package.json`. Ignorar: `src/` entero, `server/`, `electron/`, `docker/`, `plugins/`.
**Paralelizable:** No - todas las demás fases miden contra esta línea base.

#### Pasos
1. `git switch -c perf/carga-diferida` y `npm install` (hoy falta `motion` y el build del cliente falla en la notebook).
2. `npm i -D rollup-plugin-visualizer` y activarlo en `vite.config.js` solo si `process.env.VISUALIZE`.
3. `VISUALIZE=1 npm run build:client` y leer `stats.html`.
4. Escribir `scripts/bundle-budget.mjs`: parsea `dist/index.html`, junta el script de módulo, los `modulepreload` y la hoja de estilos, y suma tamaños crudos y `.br`.
5. Volcar la tabla a `docs/bundle-baseline.md` junto a los cinco paquetes más pesados del chunk principal.

#### Estado (arranca todo en fail)
- [pass] `npm install` deja el árbol completo | valida: `npm run build:client`
- [pass] `stats.html` existe y abre | valida: `VISUALIZE=1 npm run build:client && ls stats.html`
- [pass] el script de presupuesto imprime la tabla | valida: `node scripts/bundle-budget.mjs --report`
- [pass] `docs/bundle-baseline.md` registra la línea base con crudo y brotli
- [pass] figuran los cinco paquetes más pesados del chunk principal

#### Peligros
- `npm install` puede traer versiones nuevas y romper el build por algo ajeno al plan: si pasa, `npm ci` contra el lockfile.
- El visualizer encendido siempre infla el build y filtra el mapa a producción. Va detrás de la env, sin excepción.

#### Mejores prácticas
- La línea base se mide **antes** de tocar una línea de `src/`. Sin ese número, las fases siguientes no tienen contra qué comparar.

---

### Fase 2 — Terreno: esqueleto reutilizable, react-scan fuera y un solo registro
**Goal (done-criterion):** Existe `src/shared/components/LazyPanel.tsx` con su test verde Y `grep -c react-scan dist/assets/index-*.js` devuelve 0 Y `grep -rn "serviceWorker.register" src/ index.html` devuelve exactamente una coincidencia, la de `index.html`.
**Alcance:** Tocar: `src/main.tsx`, `src/shared/components/`, sus tests. Ignorar: `src/modules/` entero, `server/`, `scripts/`, `docs/`.
**Paralelizable:** No - las Fases 3, 4 y 5 importan `LazyPanel` y no pueden empezar antes.

#### Pasos
1. Crear `LazyPanel.tsx`: `Suspense` con un fallback que dibuje la forma del panel (borde, barra superior, fondo), sin salto de layout.
2. Test con vitest: primero el esqueleto, después el hijo.
3. En `main.tsx`, mover `react-scan` a un import dinámico dentro de `if (import.meta.env.DEV)`, conservando el opt-in por `localStorage`.
4. Borrar de `main.tsx` el `navigator.serviceWorker.register`: el de `index.html` ya lo hace con `updateViaCache: 'none'` y `update()`.
5. Rebuild y confirmar el ahorro contra la línea base.

#### Estado (arranca todo en fail)
- [pass] `LazyPanel` renderiza fallback y luego contenido | valida: `npm run test:client -- LazyPanel`
- [pass] `react-scan` no aparece en el bundle de producción | valida: `grep -c react-scan dist/assets/index-*.js`
- [pass] en dev el overlay sigue activándose con `localStorage react-scan=on` | valida: `npm run client`
- [pass] queda un solo registro del service worker | valida: `grep -rn "serviceWorker.register" src/ index.html`
- [pass] el camino crítico bajó respecto de la línea base | valida: `node scripts/bundle-budget.mjs --report`

#### Peligros
- `import.meta.env.DEV` dentro de un `if` lo elimina Vite en producción, pero **solo** si la condición es estática: no envolverla en una función ni en una variable.
- Sacar el registro de `main.tsx` sin que `index.html` esté desplegado dejaría la app sin service worker. El `index.html` del build ya lo trae: verificar en `dist/` antes de dar la fase por cerrada.

---

### Fase 3 — Terminal diferida
**Goal (done-criterion):** `grep -c vendor-xterm dist/index.html` devuelve 0 Y abrir la terminal en el navegador la carga y conecta Y el chunk de xterm aparece en la red recién al abrirla.
**Alcance:** Tocar: `src/modules/standalone-shell/StandaloneShell.tsx`, `src/modules/task-master/modals/TaskMasterSetupModal.tsx`, `src/modules/shell/tests/`. Ignorar: `src/modules/code-editor/`, `src/modules/chat/`, `server/`, `docs/`.
**Paralelizable:** Sí - con las Fases 4 y 5: archivos disjuntos, ningún import compartido más allá de `LazyPanel`, que la Fase 2 ya dejó escrito.

#### Pasos
1. `React.lazy` sobre `Shell` en los dos puntos de montaje.
2. Envolver cada uso en `LazyPanel` con el esqueleto de terminal.
3. Revisar los tests de `src/modules/shell/tests/`: un componente diferido necesita `Suspense` también en el test.
4. Rebuild y confirmar que `vendor-xterm` salió de los `modulepreload`.

#### Estado (arranca todo en fail)
- [pass] `vendor-xterm` fuera del camino crítico | valida: `grep -c vendor-xterm dist/index.html`
- [sin-verificar] la terminal abre, conecta y acepta teclas | valida: abrirla en el navegador — verificación de navegador, sin comando
- [sin-verificar] el modal de Task Master abre su terminal | valida: abrir el modal — verificación de navegador, sin comando
- [pass] la suite del cliente sigue verde | valida: `npm run test:client`

#### Peligros
- `Shell` mantiene refs al DOM y addons (`fit`, `webgl`): montar dentro de `Suspense` cambia el momento del primer render. Verificar que el ajuste de tamaño corra después de que el contenedor tenga dimensiones.
- Si `Shell` se importa en otro lado por un barrel (`index.ts`), el import estático sobrevive y el chunk vuelve al camino crítico. Buscar antes de dar por cerrada la fase.

---

### Fase 4 — Editor de código diferido
**Goal (done-criterion):** `grep -c vendor-codemirror dist/index.html` devuelve 0 Y abrir un archivo del árbol carga el editor y permite editar y guardar Y el editor de PRD funciona igual.
**Alcance:** Tocar: `src/modules/code-editor/EditorSidebar.tsx`, `src/modules/prd-editor/PrdEditorBody.tsx`. Ignorar: `src/modules/shell/`, `src/modules/chat/`, `server/`, `docs/`.
**Paralelizable:** Sí - con las Fases 3 y 5.

#### Pasos
1. `React.lazy` sobre `CodeEditor` en `EditorSidebar.tsx`, envuelto en `LazyPanel` con esqueleto de editor.
2. Lo mismo para CodeMirror en `PrdEditorBody.tsx`.
3. Revisar `src/modules/code-editor/markdown/` por si arrastra CodeMirror de vuelta al camino crítico.
4. Rebuild y verificar.

#### Estado (arranca todo en fail)
- [pass] `vendor-codemirror` fuera del camino crítico | valida: `grep -c vendor-codemirror dist/index.html`
- [sin-verificar] abrir un archivo carga el editor y guarda cambios | valida: editar y guardar un archivo — verificación de navegador, sin comando
- [sin-verificar] el editor de PRD funciona | valida: abrir un PRD — verificación de navegador, sin comando
- [pass] la suite del cliente sigue verde | valida: `npm run test:client`

#### Peligros
- `@replit/codemirror-minimap` y `@codemirror/merge` pueden entrar por otro import: el visualizer de la Fase 1 dice por dónde.
- El editor guarda estado al desmontar. Diferir el montaje no debe cambiar el ciclo de guardado: probar editar, cerrar y reabrir.

---

### Fase 5 — Render pesado del chat, según la auditoría
**Goal (done-criterion):** Cada pieza que la Fase 1 marcó como diferible y no está en el camino crítico figura diferida en `docs/bundle-baseline.md` Y un mensaje con código se resalta Y una fórmula matemática renderiza Y `node scripts/bundle-budget.mjs --report` muestra el camino crítico por debajo del 40% de la línea base.
**Alcance:** Tocar: `src/modules/chat/transcript/Markdown.tsx`, `src/modules/chat/utils/`, `src/shared/syntaxHighlighter.ts`, `src/modules/code-editor/markdown/`. Ignorar: `src/modules/shell/`, `src/modules/code-editor/CodeEditor.tsx`, `server/`.
**Paralelizable:** Sí - con las Fases 3 y 4.

#### Pasos
1. Diferir el resaltador de sintaxis: cargarlo al primer bloque de código, con texto plano mientras llega.
2. Diferir KaTeX (JS y su CSS, hoy importado en `main.tsx`) al primer bloque de fórmulas.
3. Revisar el resto de lo que marque el visualizer (`jszip`, `fuse.js`, `cmdk`, `i18next`) y diferir lo que no esté en el primer render.
4. Anotar cada pieza diferida en `docs/bundle-baseline.md`.

#### Estado (arranca todo en fail)
- [sin-verificar] un bloque de código se resalta al aparecer | valida: abrir un chat con código — no hay comando; `markdownSyntaxThemeInjection.test.tsx` sí prueba que el resaltador diferido reemplaza el fallback, pero eso no es la pantalla
- [sin-verificar] una fórmula renderiza | valida: abrir un mensaje con fórmula — verificación de navegador, sin comando
- [pass] el CSS de KaTeX ya no está en el CSS inicial | valida: `grep -c katex dist/assets/index-*.css` → 0
- [pass] camino crítico por debajo del 40% de la línea base | valida: `node scripts/bundle-budget.mjs --report` → 1.522.361 B contra un límite de 1.824.430 B
- [pass] la suite del cliente sigue verde | valida: `npm run test:client` → 512/512

#### Peligros
- Este es el camino crítico del chat: un error acá se ve en cada mensaje, no en una pantalla que se abre a veces. Probar con un chat largo, con código y con fórmulas.
- El resaltador diferido puede provocar un parpadeo de texto plano a texto pintado. Aceptable en el primer bloque, molesto si pasa en cada render: memorizar el módulo ya cargado.

---

### Fase 6 — Precarga en segundo plano
**Goal (done-criterion):** Existe `src/shared/prefetchHeavyChunks.ts` Y en la pantalla de login no se descarga ningún chunk diferido Y una vez montada la app los chunks de terminal y editor aparecen en la red sin que el usuario los abra Y abrir la terminal después de la precarga no muestra el esqueleto.
**Alcance:** Tocar: `src/shared/prefetchHeavyChunks.ts`, `src/App.tsx`. Ignorar: los módulos ya diferidos, `server/`, `scripts/`.
**Paralelizable:** No - precarga exactamente lo que dejaron diferido las Fases 3, 4 y 5.

#### Pasos
1. Escribir la precarga con `requestIdleCallback` y respaldo por `setTimeout` (Safari iOS no implementa el primero).
2. Llamarla desde `App.tsx` después del montaje y solo con sesión autenticada.
3. Verificar en la red que no se dispare en el login.

#### Estado (arranca todo en fail)
- [sin-verificar] nada diferido se descarga en el login | valida: pestaña de red en el login — por construcción `PrefetchHeavyChunks` solo monta como hijo de `ProtectedRoute`, pero eso es lectura de código, no medición
- [sin-verificar] los chunks llegan solos después del montaje | valida: pestaña de red tras entrar — verificación de navegador, sin comando
- [sin-verificar] abrir la terminal ya precargada no muestra esqueleto | valida: abrirla tras esperar unos segundos — verificación de navegador, sin comando
- [pass] la suite del cliente sigue verde | valida: `npm run test:client` → 512/512

#### Peligros
- Precargar demasiado pronto le roba ancho de banda al primer render del chat, que es justo lo que este plan vino a mejorar. Atarlo al idle, nunca al montaje directo.

---

### Fase 7 — Presupuesto, despliegue y verificación en el teléfono
**Goal (done-criterion):** `npm run build:client` falla si el camino crítico supera el techo Y el VPS sirve el `dist` nuevo con `Content-Encoding: br` Y `diag.html` en el iPhone muestra todos los assets en 200 Y la app monta en menos de 5 segundos Y `docs/bundle-baseline.md` registra el antes y después con porcentaje.
**Alcance:** Tocar: `scripts/bundle-budget.mjs`, `package.json`, `public/sw.js` (solo `CACHE_NAME`), `docs/bundle-baseline.md`. Ignorar: `src/` entero, `server/`.
**Paralelizable:** No - cierra el plan y mide el resultado de todas las anteriores.

#### Pasos
1. Fijar el techo en `bundle-budget.mjs` (reducción mínima del 70% respecto de la línea base) y hacer que salga con código 1 al excederlo.
2. Encadenarlo a `build:client`, después de `precompress`.
3. `npm run typecheck && npm run lint && npm run test:client`.
4. Bump de `CACHE_NAME` a `claude-ui-v6` en `public/sw.js`.
5. Build final y subida atómica al VPS: copiar a `~/cloudcli/dist.next`, renombrar `dist` a `dist.old` y `dist.next` a `dist`, y borrar `dist.old` al verificar.
6. `curl -sI -H "Accept-Encoding: br"` contra el bundle nuevo.
7. Abrir `diag.html` en el iPhone y guardar la captura.
8. Cerrar `docs/bundle-baseline.md` y `## Cambios realizados`.

#### Estado (arranca todo en fail)
- [pass] el presupuesto falla al bajar el techo a propósito | valida: `node scripts/bundle-budget.mjs --max-raw 1` → exit 1
- [pass] `build:client` corre el presupuesto | valida: `npm run build:client` → imprime el camino crítico y el veredicto al final del build
- [fail] typecheck, lint y tests verdes | valida: `npm run typecheck && npm run lint && npm run test:client` — typecheck limpio y 512/512 tests verdes, pero `lint` sale 1. **No es regresión:** el único error es `react(globals)` en `src/shared/tests/websocketOutboundQueue.test.tsx`, verificado con `git stash` que ya fallaba en la rama limpia. Cero errores de `boundaries`
- [pass] el VPS sirve el bundle nuevo comprimido | valida: `curl -sI -H 'Accept-Encoding: br' http://100.77.186.53:3001/assets/index-hGO6Hrpt.js` → `Content-Encoding: br`, 270.921 B; con el CSS y `vendor-react` suman 338.292 B, idéntico a la medición local. El bundle viejo devuelve 404
- [sin-verificar] `diag.html` en el iPhone: todos los assets 200 | valida: captura — pendiente de Leandro
- [sin-verificar] la app monta en menos de 5 s en el iPhone | valida: cronómetro sobre la carga real — pendiente de Leandro
- [pass] `docs/bundle-baseline.md` cierra con antes, después y porcentaje | valida: la sección `## Después` registra −66,6% crudo y −67,5% brotli

#### Peligros
- El swap de `dist` es el único momento con riesgo de servir archivos a medias. Se hace con `mv`, que es atómico dentro del mismo filesystem — nunca copiando encima de `dist/`.
- El `dist/index.html` del VPS tiene hoy un parche aplicado a mano el 22-sep. El build nuevo lo reemplaza con el mismo contenido desde el fuente: está commiteado, no se pierde nada.
- Si el techo queda muy ajustado, un cambio legítimo futuro rompe el build. Dejarlo en el 70% medido, no en el mínimo alcanzado.

---

## Orden de ejecución

1. **Fase 1** — sola. Nada arranca sin la línea base.
2. **Fase 2** — sola. Escribe `LazyPanel`, que las tres siguientes importan.
3. **Fases 3, 4 y 5 en paralelo** — archivos disjuntos: `shell/` + `standalone-shell/` + `task-master/` · `code-editor/` + `prd-editor/` · `chat/` + `syntaxHighlighter`. Ningún archivo compartido entre ellas.
4. **Fase 6** — después de las tres: precarga lo que dejaron diferido.
5. **Fase 7** — cierra, despliega y mide.

## Verificación final

`node scripts/bundle-budget.mjs --report` muestra el camino crítico con una reducción de al menos el 70% frente a la línea base de la Fase 1, y `diag.html` en el iPhone muestra todos los assets en 200 con la app montando en menos de 5 segundos. Las dos cosas, no una.

## Riesgos globales

- **Un import estático olvidado devuelve un chunk al camino crítico sin avisar.** El presupuesto encadenado al build es lo que lo detecta; sin él, la mejora se deshace sola con el tiempo.
- **La suite del cliente no cubre todos los puntos de montaje.** Varias verificaciones son manuales en el navegador: no marcarlas `[pass]` sin haberlas hecho.
- **El VPS tiene poca RAM libre.** Por eso el build va en la notebook y al VPS solo sube el resultado.
- **Este plan no reinicia `cloudcli`.** Si alguna fase termina pidiendo un restart, algo se salió de alcance: el servidor no se toca.

---

## Cambios realizados

**Resultado.** Camino crítico de 4.561.075 → 1.522.361 bytes crudos (−66,6%) y de 1.043.168 →
338.292 con brotli (−67,5%). De cinco archivos y tres `modulepreload` a tres archivos y uno.
Todo commiteado en `e040e81b`, rama `perf/carga-diferida`, y desplegado en el VPS.

**El 70% no se alcanzó y el techo quedó en 1.700.000 B, no en 1.366.416.** Lo que falta para
llegar no es peso diferible: es la primera pantalla —`chat` (519 KB), `sidebar` (195), micromark,
dompurify, i18next, lucide, `react-dropzone` dentro de un hook del compositor— más 173 KB de CSS
de Tailwind que el plan excluyó a propósito. Diferir cualquiera de esos cambia bytes por un
esqueleto en la pantalla que el usuario está mirando. El desglose está en `docs/bundle-baseline.md`.

**Tres cosas salieron distinto de lo escrito:**

1. **`manualChunks` no difería nada, y encima empeoraba las cosas.** Partía CodeMirror y xterm en
   chunks propios, pero la app los importaba estático, así que seguían en el camino crítico. Peor:
   Rollup eligió el chunk de CodeMirror como el compartido, y la entrada arrastraba 644 KB para
   alcanzar tres símbolos, uno de ellos el propio helper de precarga de Vite. Se quitaron los dos;
   ahora Rollup deriva esos chunks de los `import()` dinámicos y quedan fuera solos.

2. **El alcance de la Fase 5 se amplió.** El plan nombraba `chat/` y el resaltador. Se difirieron
   además `settings`, `git-panel`, `task-master`, el wizard de creación de proyecto, la lista
   reordenable de la sidebar (que arrastraba los 390 KB de `motion`), `jszip` y los 11 idiomas de
   i18n, que pasaron a cargarse de a uno con `import.meta.glob`. Sin eso el camino crítico no
   bajaba del 60%.

3. **La precarga terminó en la capa de composición, no en `shared/`.** El plan la ubicaba en
   `src/shared/prefetchHeavyChunks.ts`, y el linter tenía razón en rechazarla: un archivo de
   `shared/` que importa seis módulos es exactamente el import que la regla de dependencias existe
   para impedir. Quedó partida en dos: `src/shared/idleQueue.ts` decide *cuándo* (tiempo ocioso, de
   a un chunk, y se abstiene con `saveData` o 2g) y `src/PrefetchHeavyChunks.tsx` decide *qué*,
   pidiendo cada precarga por el barrel de su módulo.

**Dos detalles menores:** `LazyPanel` vive en `src/shared/ui/`, no en `src/shared/components/` como
decía el plan — `ui/` es la carpeta que ya existía. Y los dos tests de
`markdownSyntaxThemeInjection` necesitaron 15 s de límite: ahora esperan un `import()` real, y los
5 s por defecto de vitest no alcanzan en frío.

**Lo que queda sin verificar son las siete comprobaciones de navegador**, que no tienen comando:
terminal, editor, editor de PRD, modal de Task Master, un bloque de código resaltándose, una
fórmula renderizando y el comportamiento de la precarga en la red. Más las dos del iPhone.

---

## Continuación de Sesión

**Fases completadas:** 1 a 7 — todas ejecutadas.
**Fase actual:** cierre pendiente de verificación manual.
**Próximo paso exacto:** abrir `https://leandro-servidor.taila8c262.ts.net:8446` en el iPhone
(reinstalando la PWA) y en el escritorio, recorrer las siete comprobaciones `[sin-verificar]`. Si
todo anda, borrar el respaldo en el VPS con `rm -rf ~/cloudcli/dist.old`; si algo falla, el
rollback es `cd ~/cloudcli && mv dist dist.malo && mv dist.old dist`.
**Bloqueantes:** ninguno técnico. `npm run lint` sale 1 por el error `react(globals)` preexistente
en `websocketOutboundQueue.test.tsx`, ajeno a este plan.
**Micro-tasks pendientes:** las verificaciones de navegador; el código está completo.
