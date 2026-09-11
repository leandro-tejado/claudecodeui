# Medidor de contexto al header y splash sin marca ajena

**Fecha:** 11 de Septiembre 2026
**Estado:** en-ejecucion

El porcentaje de contexto deja de saltar de 34% a 100% —el servidor calculaba sobre una ventana de 160K que no es la del modelo— y se muda a un anillo en la cabecera, al lado del de la ventana de 5 horas. De paso, el splash de arranque deja de decir "CloudCLI".

---

## Contexto

**El salto no es un problema de refresco: son dos fuentes de verdad que no coinciden.**

| Camino | Cómo obtiene la ventana | Con la sesión de la captura |
|---|---|---|
| Transcript, al cargar la sesión (`provider-token-usage.service.ts:310`) | `resolveClaudeContextWindow(model)` → `claude-opus-5` = **1.000.000** | 336.541 / 1M = **34%** |
| WebSocket en vivo, cada turno (`claude-runtime.provider.js:434`) | `process.env.CONTEXT_WINDOW \|\| 160000` = **160.000** | 336.541 / 160K = **100%** (clampeado) |

Medido sobre `~/.claude/projects/-home-leantejado/570f541f-207a-40a3-9a4b-328a98370bd4.jsonl`, el transcript de la captura: último turno con 335.931 de input+caché y 610 de output = **336.541 tokens**. Los dos números de las capturas salen de ahí, exactos. Y `.env` tiene `CONTEXT_WINDOW=160000` escrito.

O sea: al recargar se ve el 34% correcto que vino del transcript, y el primer mensaje del stream lo pisa con el total equivocado. Por eso "pasa a 100% un segundo después" y por eso pasa siempre.

El repo **ya sabe hacerlo bien**: `resolveClaudeContextWindow` está exportada, mapea los ids de modelo, entiende el sufijo `[1m]` de Claude Code y tiene un test que dice literalmente *"the context window comes from the model that wrote the turn, not from CONTEXT_WINDOW"*. El runtime del websocket simplemente no la llama.

El segundo pedido es independiente: `AuthLoadingScreen` pinta el wordmark "CloudCLI" con tres puntos rebotando en cada recarga, en una interfaz que ya se llama LT Space. Leandro pasó su wordmark propio —"LT" en una serif de alto contraste— para reemplazarlo.

**Las dos sugerencias opcionales quedaron adentro del plan** (11-sep). La del logo propio es directa. La de distinguir Opus con y sin la variante de 1M parecía riesgosa —el transcript escribe `claude-opus-5` a secas, así que bajar el mapa a 200K habría devuelto el 100% falso— hasta que apareció dónde vive el dato: **`attachment.identity.modelId` registra la variante completa (`claude-opus-5[1m]`) y está en los seis transcripts revisados, siempre en la línea 8 o 9**. Con eso la ventana se puede resolver por tres vías, en orden: el sufijo del modelo solicitado, `identity.modelId`, y recién después el `message.model` del turno.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `server/modules/providers/list/claude/claude-runtime.provider.js` | modificar — **upstream, ~10 líneas**: la ventana sale del modelo del turno, no de un env global |
| `server/modules/providers/tests/claude-token-budget.test.ts` | modificar — tests nuevos sobre la ventana resuelta |
| `server/modules/providers/services/provider-token-usage.service.ts` | modificar — Opus/Sonnet base a 200K, y leer `identity.modelId` del transcript |
| `server/modules/providers/tests/provider-token-usage.service.test.ts` | modificar — tests de la variante `[1m]` |
| `src/modules/skin/contextMeterStore.ts` | crear — store externo, mismo patrón que `skinUiStore.ts` |
| `src/modules/skin/SkinContextMeterBridge.tsx` | crear — publica el budget del chat al store; no pinta nada |
| `src/modules/skin/SkinContextRing.tsx` | crear — el anillo de contexto de la cabecera |
| `src/modules/skin/SkinContextMeter.tsx` | **borrar** — lo reemplaza el anillo; git es el histórico |
| `src/modules/skin/SkinHeader.tsx` | modificar — montar el anillo junto al de 5h |
| `src/modules/skin/index.ts` | modificar — barril |
| `src/modules/usage-window/UsageWindowIndicator.tsx` | modificar — sumarle el % en texto |
| `src/modules/usage-window/index.ts` | modificar — exportar `CircleProgress` (las reglas del repo obligan a cruzar módulos por el barril) |
| `src/modules/chat/composer/ChatComposer.tsx` | modificar — **la misma línea ya modificada hoy**: el alias pasa a apuntar al bridge. Cero deuda nueva |
| `src/modules/auth/AuthLoadingScreen.tsx` | modificar — wordmark "LT" propio, sin los puntos que rebotan |
| `public/lt-wordmark.svg` | crear — el logo de Leandro vectorizado, monocromo, en `currentColor` |
| `.env` | modificar — comentar `CONTEXT_WINDOW` y `VITE_CONTEXT_WINDOW`, **con copia previa y sin tocar ninguna otra clave** |

---

## Micro-tasks

- [x] Copiar el `.env` antes de tocarlo — acepta: existe `.env.bak-11sep` con las mismas líneas | valida: `diff <(sort .env) <(sort .env.bak-11sep)` sin salida
- [x] Importar `resolveClaudeContextWindow` en `claude-runtime.provider.js` — acepta: `npm run build:server` compila | valida: `npm run build:server`
- [x] Darle a `buildTokenBudget` un segundo parámetro `model` y resolver `total` con él — acepta: con `claude-opus-5` devuelve `total: 1000000` | valida: `npm test`
- [x] Hacer que `total` sea `null` cuando el modelo no resuelve y no hay `CONTEXT_WINDOW` — acepta: modelo `mistral-x` sin env devuelve `total: null` | valida: `npm test`
- [x] Pasar `sdkMessage.message.model` desde `extractTokenBudget` — acepta: test del assistant con modelo da 1M | valida: `npm test`
- [x] Arrastrar `lastAssistantModel` en el loop del stream y pasárselo al lector de `compact_boundary` — acepta: el boundary posterior a un turno de Opus 5 da `total: 1000000` | valida: test nuevo en `claude-token-budget.test.ts`
- [x] Usar la key de `modelUsage` como model id en `extractCumulativeTokenBudget` — acepta: `modelUsage: { 'claude-opus-5': {...} }` da 1M | valida: `npm test`
- [x] Bajar `claude-opus-5` y `claude-sonnet-5` a 200.000 en `CLAUDE_CONTEXT_WINDOWS` — acepta: solo la variante `[1m]` da 1M | valida: `npm test`
- [x] Leer `attachment.identity.modelId` en `summarizeClaudeTokenUsage` y preferirlo sobre `message.model` — acepta: transcript con `identity` `[1m]` y `message.model` sin sufijo da 1M | valida: `npm test`
- [x] Pasar el modelo **solicitado** (`options.model`, ej `opus[1m]`) al runtime y darle prioridad sobre el del turno — acepta: `opus[1m]` da 1M aunque el turno diga `claude-opus-5` | valida: `npm test`
- [x] Comentar `CONTEXT_WINDOW` y `VITE_CONTEXT_WINDOW` en `.env` con `sed -i` sobre esas dos líneas — acepta: el resto del archivo byte a byte igual | valida: `diff .env .env.bak-11sep` muestra solo esas dos líneas
- [x] Crear `contextMeterStore.ts` con `useSyncExternalStore` copiando la forma de `skinUiStore.ts` — acepta: `useContextMeter()` devuelve `null` sin publicar | valida: test de vitest
- [x] Crear `SkinContextMeterBridge.tsx` que publica `{ usage, onShowDetails }` y limpia al desmontar — acepta: al desmontar el store vuelve a `null` | valida: test de vitest
- [x] Reapuntar el alias de `ChatComposer.tsx:33` al bridge — acepta: el composer ya no muestra la barrita de contexto | valida: `npm run test:client`
- [x] Exportar `CircleProgress` desde `src/modules/usage-window/index.ts` — acepta: `npm run lint` sin quejas de arquitectura | valida: `npm run lint:client`
- [x] Crear `SkinContextRing.tsx`: anillo 22px, tres tramos de color, % en `hidden sm:inline` — acepta: renderiza anillo + "34%" en desktop | valida: test de vitest con `usage` de 336.541/1M
- [x] Hacer que el anillo no se muestre cuando falta `total` o `used` es 0 — acepta: devuelve el anillo gris, nunca un porcentaje | valida: test de vitest con `total: null`
- [x] Montar `SkinContextRing` en `SkinHeader` a la izquierda de `UsageWindowIndicator` — acepta: los dos anillos juntos, en ese orden | valida: `npm run test:client`
- [x] Sumarle a `UsageWindowIndicator` el `snapshot.porcentaje` en texto, con las mismas clases — acepta: mismo markup que el anillo de contexto | valida: `npm run test:client`
- [x] Verificar que los porcentajes salen con `hidden sm:inline` y que los indicadores son `flex-none` — acepta: a 390px quedan solo los anillos | valida: test de vitest sobre las clases
- [x] Borrar `SkinContextMeter.tsx` y sacarlo del barril — acepta: `npm run typecheck` sin referencias colgando | valida: `npm run typecheck`
- [x] Vectorizar el JPG del wordmark a `public/lt-wordmark.svg` trazando el contorno del bitmap con `sharp` — acepta: un solo `<path fill="currentColor">`, sin fondo, viewBox ajustado a la tinta | valida: `grep -c currentColor public/lt-wordmark.svg`
- [x] Verificar que el SVG no arrastra el fondo crema del JPG — acepta: no hay `<rect>` de fondo ni `fill="#f...` | valida: `cat public/lt-wordmark.svg`
- [x] Reemplazar el logo y el wordmark del splash por el SVG propio, sin la caja azul — acepta: no queda la cadena "CloudCLI" en `AuthLoadingScreen.tsx` | valida: `grep -c CloudCLI src/modules/auth/AuthLoadingScreen.tsx` devuelve 0
- [x] Sacar los tres puntos que rebotan del splash — acepta: no queda `animate-bounce` en el archivo | valida: `grep animate-bounce src/modules/auth/AuthLoadingScreen.tsx` sin salida
- [x] Confirmar que la atribución AGPL sigue intacta en `NOTICE` y `README.md` — acepta: ambos mencionan siteboon/claudecodeui | valida: `grep -c siteboon NOTICE README.md`
- [x] Levantar `server:dev` + `vite` en puertos libres distintos a los de producción — acepta: responden 200 y sirven el bundle nuevo | valida: `curl`
- [x] Correr la batería completa — acepta: todo verde | valida: `npm run typecheck && npm run lint && npm test && npm run test:client`
- [x] Commit y push en `diseno/propio` — acepta: `git status` limpio y la rama al día | valida: `git log origin/diseno/propio -1 --oneline`

---

## Análisis Crítico

> Completado en Fase 2.5. Leandro decide qué se incorpora antes de arrancar.

### Incongruencias detectadas

- **`CONTEXT_WINDOW=160000` en el `.env` sabotea la decisión que tomaste.** Elegiste "si no se resuelve el modelo, no se muestra". Con esa clave escrita, el fallback nunca es `null`: siempre hay 160.000 esperando para volver a mentir. Por eso el plan la comenta en vez de dejarla. Si preferís conservarla como override manual, decilo y la dejo: el precio es que un modelo nuevo y desconocido vuelve a marcar 100% falso.
- **`plans/10-septiembre-indicador-ventana-5h.md` dice `en-ejecucion` y el commit `737132fa` dice "indicador desplegado y verificado contra el proceso en vivo".** Una de las dos cosas es falsa. El propio CLAUDE.md dice que un plan que miente sobre su estado es peor que no tenerlo. Está fuera de este scope, pero conviene cerrarlo y archivarlo. `10-septiembre-lt-space-ux.md` está en el mismo estado.

### Huecos no cubiertos

- **`npm run build:client` escribe directo sobre el `dist/` que producción está sirviendo ahora mismo.** El arreglo del cliente se va a ver **sin reiniciar nada**, apenas recargues; solo el del servidor espera el restart. El costo es que los hashes de bundle cambian bajo los pies de cualquier pestaña abierta: conviene buildear cuando no haya un turno corriendo.
- **El service worker (`/sw.js`) cachea la app.** Después del build puede hacer falta un hard-reload para ver el splash nuevo. No es un bug del cambio; es lo que va a pasar cuando lo pruebes.
- **`total: null` viaja a consumidores que no estoy tocando.** `CommandResultModal.tsx:423` ya hace `Number(... ?? 0)`, así que aguanta. Codex y OpenCode traen su propio total y no pasan por este camino. Verificado, pero queda anotado.
- **El click del anillo abre el modal de desglose del chat**, y ese callback vive en el composer. El store lo transporta junto con el budget. Es el punto menos elegante del diseño y está comentado en el código: la alternativa era un popover propio, que duplicaría un modal que ya existe.

### Áreas relacionadas a monitorear

- `useSessionStore.ts` (líneas 517, 616, 686) hidrata `slot.tokenUsage` desde el transcript. Es la fuente "buena" y no se toca, pero es la que hoy da el 34% inicial: si algo sale mal, ahí se ve primero.
- `useChatRealtimeHandlers.ts:330` filtra los budgets por sesión activa. Ese filtro ya está bien y hay que dejarlo: es lo que evita que una sesión en paralelo pise el número de la que estás mirando.
- `websocketWatchdog` y la reconexión: el anillo de contexto no hace seed propio por HTTP, se alimenta del chat. Si el socket cae, el número se congela en el último valor conocido en vez de mentir. Es el comportamiento correcto, pero es distinto al del anillo de 5h, que sí refetchea al reconectar.

### Zonas intocables

- **`usage-window/` del lado servidor entero.** El indicador de 5 horas funciona y está calibrado contra dos agotamientos reales. Del cliente solo se le agrega el porcentaje en texto; el cálculo no se toca.
- **`CircleProgress.tsx`**, que es código de terceros copiado byte a byte a propósito. Se usa, no se refactoriza.
- **`extractTokenBudget`, en todo lo que ya filtra**: subagentes por `parent_tool_use_id`, eventos `task_progress`, y el `result` de fin de turno. Cada uno de esos filtros arregló un salto del contador que ya está resuelto. Se le agrega el modelo y nada más.
- **El resto del `.env`.** Se comentan dos líneas con `sed` y se hace copia antes. Ninguna otra clave se lee ni se escribe.

### Sugerencias incorporadas (11-sep, aprobadas)

- [x] **Logo propio en el splash.** Leandro pasó el wordmark "LT". Entra en la Fase 4: se vectoriza a SVG monocromo en vez de usar el JPG, porque el JPG trae fondo crema opaco y en tema oscuro sería un bloque claro flotando. Con `currentColor` sigue al tema.
- [x] **Distinguir Opus con y sin la variante de 1M.** Entra en la Fase 1. **Tiene una trampa y por eso cambia cómo se implementa:** el transcript escribe `claude-opus-5` sin sufijo, así que bajar el mapa a 200K a secas habría devuelto exactamente el 100% falso que este plan arregla. La variante se lee de `attachment.identity.modelId`, que sí la registra, con el modelo solicitado como primera prioridad.

### Sugerencias opcionales que siguen abiertas

- [ ] **`AuthScreenLayout.tsx` y el favicon siguen con el logo de CloudCLI.** El pedido era el splash; estos quedan afuera. Esfuerzo: bajo, una vez que el SVG exista.
- [ ] **`claude-fable-*` y `claude-mythos-*` quedan en 1M en el mapa.** No tengo fuente para sus ventanas reales y no pienso inventarlas. Solo se tocan los dos modelos donde el propio selector de CloudCLI ofrece las dos variantes por separado, que es la evidencia de que la base no es 1M.
- [ ] **Cerrar y archivar los dos planes del 10-sep.** Esfuerzo: diez minutos, y deja el `plans/` diciendo la verdad.

---

## Fases

### Fase 1 - La ventana sale del modelo, no del env

**Goal (done-criterion):** `claude-runtime.provider.js` no contiene la cadena `|| 160000` Y `npm test` pasa con los tests nuevos: con el modelo solicitado `opus[1m]` devuelve `total: 1000000`; un `compact_boundary` posterior hereda esa misma ventana; un modelo desconocido sin `CONTEXT_WINDOW` devuelve `total: null`; `claude-opus-5` sin ninguna marca de variante devuelve `total: 200000`; y un transcript cuyo `identity.modelId` es `claude-opus-5[1m]` pero cuyo `message.model` es `claude-opus-5` devuelve `total: 1000000`.

**Alcance:** Tocar: `claude-runtime.provider.js`, `provider-token-usage.service.ts` y los dos archivos de test correspondientes, `.env`. Ignorar: todo `src/`, los providers de codex y opencode, `usage-window/`, `/docs`.

**Paralelizable:** Sí, con la Fase 4 — no comparten un solo archivo.

#### Pasos

1. `cp .env .env.bak-11sep`.
2. Importar `resolveClaudeContextWindow` desde `@/modules/providers/services/provider-token-usage.service.js` (el `.js` del repo ya importa `.ts` así: ver `claude-models.provider.js` en la línea 26).
3. `buildTokenBudget(messageUsage, model)`: `total = resolveClaudeContextWindow(model) ?? parseInt(process.env.CONTEXT_WINDOW, 10) || null`.
4. `extractTokenBudget`: pasarle `sdkMessage.message?.model`.
5. En el loop del stream (~línea 985), guardar `lastAssistantModel` en cada mensaje `assistant` y pasárselo a `extractCompactBoundaryTokenBudget(message, lastAssistantModel)` — un `compact_boundary` es un `system` y no trae modelo.
6. `extractCumulativeTokenBudget`: la key de `modelUsage` **es** el model id; usarla, y caer en `lastAssistantModel` para la rama de `sdkMessage.usage`.
7. Darle al runtime el modelo **solicitado** (`sdkOptions.model`, que conserva el sufijo `[1m]` del selector) y resolverlo **antes** que el del turno: el transcript escribe el id sin variante.
8. Bajar `claude-opus-5` y `claude-sonnet-5` a `200_000` en `CLAUDE_CONTEXT_WINDOWS`. Solo esos dos: son los únicos donde el selector ofrece base y `[1m]` por separado, que es la evidencia de que la base no es de un millón.
9. En `summarizeClaudeTokenUsage`, buscar `attachment.identity.modelId` mientras recorre las filas y preferirlo sobre `message.model` cuando comparten id base. Es el único lugar del transcript donde sobrevive la variante.
10. Comentar las dos líneas del `.env` con `sed -i 's/^CONTEXT_WINDOW=/#CONTEXT_WINDOW=/'` y su equivalente para `VITE_`. Nunca reescribir el archivo entero.

#### Estado (arranca todo en fail)

- [pass] No queda ningún `|| 160000` en el provider | valida: `grep -n "160000" server/modules/providers/list/claude/claude-runtime.provider.js` sin salida
- [pass] El modelo solicitado `opus[1m]` da `total: 1000000` | valida: `npm test`
- [pass] Un `compact_boundary` hereda esa misma ventana | valida: `npm test`
- [pass] Modelo desconocido sin env da `total: null` | valida: `npm test`
- [pass] `claude-opus-5` sin marca de variante hace que el runtime **se abstenga** (`total: null`) — ver Cambios realizados | valida: `npm test`
- [pass] `identity.modelId` con `[1m]` gana sobre un `message.model` sin sufijo | valida: `npm test`
- [pass] Sobre el transcript real de la captura, el total resuelto es 1.000.000 y el porcentaje 34% | valida: script de un tiro contra `570f541f-…jsonl`
- [pass] El `.env` difiere del backup **solo** en esas dos líneas | valida: `diff .env .env.bak-11sep`
- [pass] El server compila | valida: `npm run build:server`

#### Peligros

- **Reescribir el `.env`.** Es la regla dura de esta máquina y ya costó una vez: hay claves ahí que este plan no necesita entender. `sed -i` sobre dos líneas, con copia previa, y nada más.
- `resolveClaudeContextWindow` devuelve `null` para lo desconocido **a propósito**. Si alguien le pone un `?? 160_000` adentro, el bug vuelve y encima queda escondido.
- **Bajar Opus a 200K sin que la detección de variante funcione reintroduce el bug exacto que este plan arregla**, y encima lo deja pareciendo intencional. El check contra el transcript real de la captura es el que lo atrapa: si ahí no da 34%, la fase no cierra.
- El `.env.bak-11sep` no va a git — `.gitignore` ya cubre `.env.*`. Verificar antes de commitear.

#### Mejores prácticas

- Una sola fuente de verdad: el runtime y el lector de transcripts deben pasar por la misma función. Si el número difiere entre recargar y seguir chateando, es que quedaron dos caminos.
- Los tests van con los números reales medidos (336.541 sobre 1M), no con redondeos. El test documenta el bug que arregló.

---

### Fase 2 - El budget del chat llega a la cabecera

**Goal (done-criterion):** Existen `src/modules/skin/contextMeterStore.ts` y `src/modules/skin/SkinContextMeterBridge.tsx` Y un test de vitest verifica que publicar un budget lo hace visible en `useContextMeter()` y que desmontar el bridge lo devuelve a `null` Y `ChatComposer.tsx` ya no renderiza ninguna barra de contexto.

**Alcance:** Tocar: `src/modules/skin/`, la línea 33 de `src/modules/chat/composer/ChatComposer.tsx`, tests nuevos. Ignorar: `server/`, `usage-window/`, el resto del módulo `chat`.

**Paralelizable:** No — la Fase 3 consume este store.

#### Pasos

1. Crear `contextMeterStore.ts` calcando `skinUiStore.ts`: `useSyncExternalStore`, snapshot estable, sin persistencia (el contexto es de la sesión viva, no sobrevive a la recarga).
2. El snapshot es `{ usage, onShowDetails } | null`.
3. Crear `SkinContextMeterBridge.tsx`: recibe las mismas props que recibía `SkinContextMeter`, publica en un `useEffect` y devuelve `null`. Comentar arriba por qué un componente no pinta nada — es un puente de datos, no un componente muerto.
4. Limpiar en el cleanup del efecto: si el chat se desmonta, el header no puede seguir mostrando el contexto de una sesión que ya no está.
5. Reapuntar el alias del import en `ChatComposer.tsx:33`. Esa línea **ya está modificada** respecto de upstream, así que el diff de merge no crece.

#### Estado (arranca todo en fail)

- [pass] `useContextMeter()` devuelve lo publicado | valida: `npm run test:client`
- [pass] Al desmontar el bridge vuelve a `null` | valida: `npm run test:client`
- [pass] El composer no muestra más la barrita de contexto | valida: test de vitest sobre el DOM del composer
- [pass] El diff contra upstream en `ChatComposer.tsx` sigue siendo de una línea | valida: `git diff main -- src/modules/chat/composer/ChatComposer.tsx | grep -c "^+" `
- [pass] Typecheck limpio | valida: `npm run typecheck`

#### Peligros

- Publicar en cada render en vez de en un efecto con dependencias: el composer re-renderiza en cada tecla y el header terminaría re-renderizando con él.
- El snapshot de `useSyncExternalStore` tiene que ser **estable entre renders** o React entra en loop. Guardar el objeto y reemplazarlo solo cuando cambia de verdad, como hace `skinUiStore`.

#### Mejores prácticas

- El store no toca `localStorage`: un porcentaje de contexto guardado es un número viejo esperando para mentir.
- Comparar el `usage` por valor antes de emitir, para no despertar al header cuando el budget llega igual.

---

### Fase 3 - Los dos anillos, juntos y con su número

**Goal (done-criterion):** `SkinHeader` renderiza `SkinContextRing` inmediatamente a la izquierda de `UsageWindowIndicator`, los dos con anillo de 22px y su porcentaje en texto Y un test de vitest verifica que con `{ used: 336541, total: 1000000 }` el anillo muestra `34%` y que con `total: null` no muestra ningún porcentaje Y `SkinContextMeter.tsx` ya no existe.

**Alcance:** Tocar: `src/modules/skin/SkinContextRing.tsx`, `SkinHeader.tsx`, `index.ts`, `src/modules/usage-window/UsageWindowIndicator.tsx` y su `index.ts`. Ignorar: `server/`, `modules/chat/`, el cálculo de la ventana de 5h.

**Paralelizable:** No — depende de la Fase 2.

#### Pasos

1. Exportar `CircleProgress` desde el barril de `usage-window` (las reglas de arquitectura del repo obligan a cruzar módulos por el barril; está documentado en `SkinHeader.tsx`).
2. Crear `SkinContextRing.tsx`: lee el store, `CircleProgress` de 22px y `strokeWidth` 2.5 para igualar al de 5h, y el `%` en un `<span className="hidden tabular-nums sm:inline">`.
3. Sin `total`, o con `used` en 0: anillo gris transparente, igual que hace `UsageWindowIndicator` antes de su primer snapshot. Nunca un número.
4. Tramos de color: el `defaultGetColor` de `CircleProgress` (verde <70%, ámbar <90%, rojo) ya coincide con los que usaba `SkinContextMeter`. No escribir otros.
5. Montarlo en `SkinHeader`, justo antes de `<UsageWindowIndicator />`.
6. Agregarle a `UsageWindowIndicator` su `snapshot.porcentaje` con **las mismas clases**, para que los dos se lean como un par.
7. Borrar `SkinContextMeter.tsx` y sacarlo del barril.
8. Verificar a 390px de ancho que quedan solo los anillos y el título no desborda.

#### Estado (arranca todo en fail)

- [pass] Con 336.541/1M el anillo dice `34%` | valida: `npm run test:client`
- [pass] Con `total: null` no hay porcentaje en el DOM | valida: `npm run test:client`
- [pass] Los dos anillos aparecen juntos, contexto a la izquierda | valida: test de vitest sobre el orden en el DOM
- [pass] El porcentaje sale con `hidden sm:inline`, así que a 390px no se renderiza | valida: test de vitest sobre las clases
- [pass] `SkinContextMeter.tsx` no existe y nada lo importa | valida: `npm run typecheck && grep -rn SkinContextMeter src/`
- [pass] Lint limpio | valida: `npm run lint:client`

#### Peligros

- Duplicar `CircleProgress` en `skin/` en vez de importarlo: dos anillos que se ven distintos es exactamente lo que pediste evitar.
- El `%` en texto empuja el `<nav>` de pestañas. El título ya es `min-w-0 flex-1`; los indicadores tienen que quedar `flex-none` o le comen el ancho.

#### Mejores prácticas

- Tooltip y `aria-label` con el número completo (`336K de 1M · 34%`), como ya hace el de 5h: el anillo es para el vistazo, el detalle está a un hover.
- Mismo tamaño, mismo grosor, misma tipografía en los dos. La simetría es el punto del pedido.

---

### Fase 4 - El splash deja de decir CloudCLI

**Goal (done-criterion):** Existe `public/lt-wordmark.svg` con un único `<path fill="currentColor">` y sin fondo Y `grep -c CloudCLI src/modules/auth/AuthLoadingScreen.tsx` devuelve 0 Y `grep animate-bounce` sobre ese archivo no devuelve nada Y `NOTICE` y `README.md` siguen citando a siteboon/claudecodeui.

**Alcance:** Tocar: `src/modules/auth/AuthLoadingScreen.tsx`, `public/lt-wordmark.svg`. Ignorar: `SidebarHeader.tsx` y `AboutTab.tsx`, que usan el wordmark tipográfico y no están en el pedido; `AuthScreenLayout.tsx`; `public/logo.svg`, que sigue alimentando favicon y PWA; `server/`.

**Paralelizable:** Sí, con la Fase 1 — no comparten archivos.

#### Pasos

1. Trazar el contorno del JPG con `sharp`: leer a gris, umbralizar en 128, seguir el borde y colapsar los puntos colineales. El bitmap de tinta mide 159×97 dentro de un lienzo de 500×500, así que el `viewBox` se ajusta a la tinta y el fondo crema no viaja.
2. Escribir `public/lt-wordmark.svg` con un solo `<path fill="currentColor">`. **Monocromo y sin fondo a propósito:** el JPG tiene fondo crema opaco, que en tema oscuro sería un bloque claro flotando. Con `currentColor` el wordmark hereda `text-foreground` y sirve en los dos temas.
3. En el splash, reemplazar la caja azul con el logo de CloudCLI **y** el `<h1>` de texto por el wordmark solo: el logo ya dice "LT", repetirlo abajo en texto sería decirlo dos veces.
4. Borrar el bloque de los tres puntos, la constante `loadingDotAnimationDelays` y el import de `CLOUDCLI_WORDMARK_FONT_FAMILY`, que deja de usarse acá.
5. Dejar el `<p className="sr-only">` con el estado de carga: es lo que lee un lector de pantalla y sacarlo sería una regresión de accesibilidad, no una mejora de velocidad.
6. Confirmar que la atribución obligatoria de la AGPL sigue en `NOTICE` y `README.md` — vive ahí, no en el splash, así que quitar el wordmark de la UI no toca la licencia.

#### Estado (arranca todo en fail)

- [pass] Existe el SVG con un solo path en `currentColor` y sin fondo | valida: `grep -c "currentColor" public/lt-wordmark.svg` y revisión del archivo
- [pass] El SVG renderiza las dos letras, no una mancha | valida: comparar el área de tinta del SVG contra la del JPG, tolerancia 2%
- [pass] Cero apariciones de "CloudCLI" en el archivo | valida: `grep -c CloudCLI src/modules/auth/AuthLoadingScreen.tsx`
- [pass] Sin `animate-bounce` ni la constante de delays | valida: `grep -nE "animate-bounce|loadingDotAnimationDelays" src/modules/auth/AuthLoadingScreen.tsx`
- [pass] El splash monta el SVG y nada más | valida: test de vitest sobre el DOM del componente
- [pass] Atribución intacta | valida: `grep -c siteboon NOTICE README.md`

#### Peligros

- Devolver `null` desde `ProtectedRoute` en vez de una pantalla: un parpadeo blanco en tema oscuro es peor que lo que había.
- El service worker puede servir el bundle viejo. Un hard-reload al verificar, o vas a pensar que no funcionó.
- **Meter el JPG tal cual en `public/`.** Se ve bien en tema claro y como un ladrillo crema en oscuro. Por eso se vectoriza.
- Trazar el contorno sin simplificar colineales deja un path de miles de puntos. A 64px no se nota, pero el archivo se vuelve impresentable.

---

### Fase 5 - Verificar corriendo, y recién ahí cerrar

**Goal (done-criterion):** `npm run typecheck && npm run lint && npm test && npm run test:client && npm run build` termina en 0 Y el dev server responde con el bundle nuevo Y la rama `diseno/propio` está pusheada Y el plan quedó en `completado` con su sección de cambios.

> **Lo visual lo confirma Leandro.** En esta máquina no hay Playwright ni Puppeteer —verificado, no están en `node_modules`— así que no puedo sacar una captura. Todo lo que se puede verificar sin ojos se verifica con tests sobre el DOM y con datos reales; la confirmación de que los dos anillos se ven bien juntos y de que el splash quedó lindo es de él. Decirlo acá y no fingir una captura es parte del trabajo.

**Alcance:** Tocar: nada de código salvo lo que rompa un check. Ignorar: producción — el restart lo corre Leandro.

**Paralelizable:** No — es el cierre.

#### Pasos

1. Levantar `npm run server:dev` y `npm run client` con `SERVER_PORT` y `VITE_PORT` **inline**, en puertos libres distintos a los de producción. No tocar el `.env` para esto.
2. Correr el resolutor contra los transcripts reales de `~/.claude/projects/-home-leantejado/` y comprobar que el total sale 1.000.000 y el porcentaje 34% en la sesión de la captura. Ese es el bug original, medido.
3. Comprobar por `curl` que el dev server sirve el bundle nuevo y que el SVG del wordmark se descarga con 200.
4. Batería completa de tests y build.
6. Commit y push en `diseno/propio`, con `.env.bak-11sep` fuera del commit.
7. Pasarle a Leandro el comando de restart y la verificación posterior.

#### Estado (arranca todo en fail)

- [pass] Typecheck, lint, tests de server y de cliente en verde | valida: `npm run typecheck && npm run lint && npm test && npm run test:client`
- [pass] El build pasa | valida: `npm run build`
- [pass] Sobre el transcript de la captura, el total es 1.000.000 y el porcentaje 34% | valida: script contra `570f541f-…jsonl`
- [pass] Las dos vías —transcript y runtime— devuelven el mismo total para la misma sesión | valida: comparar las dos salidas
- [pass] El dev server sirve el wordmark | valida: `curl -o /dev/null -w '%{http_code}' …/lt-wordmark.svg`
- [fail] Confirmación visual de Leandro sobre los dos anillos y el splash | valida: él lo mira
- [pass] Rama pusheada | valida: `git log origin/diseno/propio -1 --oneline` → `8f00b197`

#### Peligros

- **`npm run build` escribe sobre el `dist/` que producción sirve ahora.** El arreglo del cliente se va a ver apenas recargues, sin restart; el del servidor no. Conviene correrlo sin un turno en curso, porque los hashes de bundle cambian bajo cualquier pestaña abierta.
- Levantar el dev server en el puerto de producción lo tumba. Puertos inline, verificados libres antes.

#### Mejores prácticas

- Un check se pasa a `[pass]` corriendo el comando, no leyendo el código.
- El plan se archiva en `plans/_archivo/` en el mismo commit que lo marca completado.

---

## Orden de ejecución

- **Fase 1 y Fase 4 en paralelo**: backend y splash no se tocan.
- **Fase 2 → Fase 3**: secuenciales, la 3 consume el store de la 2. Pueden arrancar sin esperar a la 1, pero hasta que la 1 esté el número del anillo sigue siendo el equivocado.
- **Fase 5** al final, con todo mergeado en el árbol.

## Verificación final

Sobre una sesión con contexto ya consumido, en el dev server:

1. El header muestra dos anillos con su porcentaje.
2. El del contexto coincide con `used / resolveClaudeContextWindow(model)` del transcript — para la sesión de referencia, **34%**.
3. Llega un turno nuevo: el número se mueve unos pocos puntos. **No salta a 100%.**
4. Recarga: el número es el mismo antes y después de que el socket reconecte.
5. Durante la recarga, el splash dice "LT" y no tiene puntos rebotando.

Después, en producción, lo corre Leandro:

```
sudo systemctl restart cloudcli && systemctl status cloudcli --no-pager | head -5
```

## Riesgos globales

- **Este agente no puede reiniciar `cloudcli.service`**: es un servicio de sistema y `sudo` pide contraseña, que no se pide por chat. El plan entrega build, tests y el dev server verificado; el restart queda del lado de Leandro. **Hasta ese restart, el arreglo del servidor no está corriendo en producción.**
- El repo puede estar en uso concurrente desde la notebook. `git pull` antes de arrancar y `git status --short` antes de cada fase.
- **No hay navegador headless en esta máquina**, así que la verificación visual es tuya. Lo que sí queda verificado con datos es lo que importa: que el porcentaje salga 34% sobre el transcript real y que las dos vías coincidan.
- **La detección de la variante `[1m]` es ahora parte del camino crítico.** Si falla, el medidor no se queda corto: vuelve a marcar 100%. Por eso hay un check que corre contra tu transcript real y no solo contra fixtures.

---

## Cambios realizados

### Fase 1 — la abstención salió del dato, no del diseño original

El plan decía que el runtime resolvería la ventana con el modelo solicitado y, si no, con el del turno. **La base de sesiones lo desmintió antes de escribir una línea de más:** de 19 sesiones guardadas, 12 llevan `opus[1m]`, 5 llevan `default` y 2 llevan `claude-opus-5` pelado. Para esas 7 el runtime no tiene de dónde sacar la variante, y caer al id del turno habría respondido 200K sobre sesiones de 1M — el mismo 100% falso, disfrazado de arreglo.

Así que el runtime **se abstiene** en vez de adivinar: `claudeContextWindowIsAmbiguous()` marca los ids que el selector parte en dos variantes (`opus`, `sonnet`, `claude-opus-5`, `claude-sonnet-5`) y para ésos manda `total: null`. El lector de transcripts sí puede resolverlos, porque tiene `identity.modelId`. El contrato quedó: **el socket manda el consumo, el transcript manda la ventana.** La Fase 2 lo cierra haciendo que un `total` nulo conserve el anterior en vez de borrarlo.

Eso simplificó el runtime: se cayeron el `lastAssistantModel` que el plan pedía arrastrar por el stream y el uso de la key de `modelUsage`, porque ninguno de los dos aporta la variante.

**Medido, no estimado:**

| Transcript | identity | Tokens | Ventana | Antes | Ahora |
|---|---|---|---|---|---|
| `570f541f` (el de la captura) | `claude-opus-5[1m]` | 336.541 | 1.000.000 | 100% | **34%** |
| `33e1e86a` | `claude-opus-5[1m]` | 180.332 | 1.000.000 | 100% | **18%** |
| `fd331c68` | `claude-opus-5[1m]` | 487.193 | 1.000.000 | 100% | **49%** |

Tests: 34 verdes entre los dos archivos tocados, 8 de ellos nuevos. La batería completa del server da 431/436, con **4 fallos preexistentes** en `claude-cli-path.test.ts` — resolución de ejecutable en Windows corriendo sobre Linux. Verificado con `git stash`: fallan igual en `HEAD` sin ningún cambio mío.

### Fases 2 y 3 — el indicador

El store conserva el total y reemplaza el consumo, que es la otra mitad del contrato de la Fase 1. El puente vive donde upstream monta su `TokenUsageSummary`, así que **la deuda de merge no creció**: sigue siendo la misma línea de import que ya estaba desviada.

Los dos anillos quedaron con el mismo markup —`CircleProgress` de 22px, `strokeWidth` 2.5, porcentaje en `hidden sm:inline`— y el de contexto va primero, porque es el que se agota varias veces dentro de una misma ventana de cinco horas. `SkinContextMeter.tsx` se borró; git es el histórico.

12 tests nuevos entre el store, el puente y el anillo, incluido el que fija la propiedad que importa: republicar los mismos números **no** re-renderiza la cabecera, aunque el composer re-renderice en cada tecla.

### Fase 4 — el wordmark

No había potrace, inkscape ni imagemagick en la máquina, pero sí `sharp` en `node_modules`. El JPG se vectorizó trazando las aristas de píxel que separan tinta de fondo sobre un escalado 4× —lanczos y umbral en 128—, encadenándolas en ciclos y colapsando los puntos colineales. Salieron dos contornos (la L y la T), 750 puntos, 7,6 KB.

**Verificado contra el original, no a ojo:** el área de tinta del SVG rasterizado difiere **0,53%** de la del JPG recortado al mismo encuadre, con el check puesto en 2%. Y se miró renderizado: las serifas y el contraste de la Didone están.

El SVG es monocromo y hereda `currentColor` a propósito. El JPG trae fondo crema opaco y en tema oscuro habría quedado como un ladrillo claro flotando.

El splash perdió la caja azul, el `<h1>` de texto —el logo ya dice "LT", repetirlo abajo sería decirlo dos veces— y los tres puntos. Queda el wordmark sobre el fondo del tema y el `sr-only` con el estado de carga, que es lo único que ahí necesitaba un lector de pantalla.

### Fase 5 — lo que se corrió

| Check | Resultado |
|---|---|
| `npm run typecheck` | limpio, front y back |
| `npm run lint` | salida 0; los warnings son preexistentes y ninguno cae en archivos nuevos |
| `npm test` (server) | 431/436 — los 4 fallos son los preexistentes de Windows |
| `npm run test:client` | **430/430**, 64 archivos |
| `npm run build` | completo, cliente y servidor |
| `dist/lt-wordmark.svg` por HTTP | 200, 7.633 bytes, `image/svg+xml` |
| Transcript real `570f541f` | 336.541 / 1.000.000 = **34%** |

**Un tropiezo del entorno que conviene saber:** este shell hereda `NODE_ENV=production`, y con eso `npm run test:client` falla entero —`act(...) is not supported in production builds of React`— incluso en tests que nadie tocó. Hay que correrlo como `NODE_ENV=test npm run test:client`. No es del código; es de la máquina.

---

## Continuación de Sesión

**Fases completadas:** 1, 2, 3, 4 y 5, todas con sus checks corridos.
**Fase actual:** ninguna. El plan queda en `en-ejecucion` y **no se archiva** hasta que pasen las dos cosas que no dependen de mí — decir "completado" antes sería mentir sobre el estado.
**Próximo paso exacto:** Leandro corre `sudo systemctl restart cloudcli`, recarga con hard-reload y mira dos cosas: que los dos anillos aparezcan juntos con su porcentaje, y que el porcentaje del contexto **no salte** cuando llega el turno siguiente.
**Bloqueantes:** el restart necesita `sudo`, que acá pide contraseña. Hasta ese restart el arreglo del servidor no corre en producción; el del cliente ya está en `dist/` y se ve con recargar.
**Micro-tasks pendientes:** 32 de 32
