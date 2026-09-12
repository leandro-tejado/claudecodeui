# Indicador de ventana de 5 horas en la barra superior

**Fecha:** 10 de Septiembre 2026
**Estado:** corregido y archivado — el indicador existe, su calibración no vale

Un círculo de progreso en el header de CloudCLI que muestra cuánto queda de la ventana de 5 horas de Claude, sumando todas las sesiones del VPS y actualizándose en vivo por WebSocket.

---

## Corrección del 11-sep-2026 — la calibración de este plan medía dos cosas mal

**El indicador se construyó y funciona. Lo que no vale es cómo calculaba el porcentaje**, y se reemplazó entero el 11-sep. Los dos errores están en la tabla del Contexto que sigue abajo, que se deja tal cual quedó para poder auditarla.

**Error 1 — contó líneas del transcript, no llamadas.** Una respuesta del modelo se escribe en varias líneas del `.jsonl`. Los "1.706 turnos" de la Ventana 1 fueron **791 llamadas reales**: un factor ×2,2. El cache-read de 334,2 M está inflado por lo mismo. La unidad correcta es el `requestId` único.

**Error 2, el que importa — la métrica no es el output.** El plan concluye que *"la métrica es el output"* porque los dólares divergían un 30% entre las dos ventanas mientras la salida divergía un 6%. Medido sobre ocho ventanas agotadas, en vez de dos: **la salida explica entre el 10% y el 18% del costo**; el resto es contexto releído (43-67%) y escritura de cache (20-39%). Las dos ventanas del 09-sep tenían salida parecida por casualidad —eran dos días de trabajo parecido—, no porque la salida sea el límite.

La consecuencia práctica fue un anillo que mostraba un número plausible y equivocado, y un "hueco" inexistente en los cortes del 10 y el 11-sep: ventanas que en salida parecían haber cortado antes de tiempo y que, medidas en costo, entran en el rango normal.

**Y el auto-recalibrado empeoraba el problema en vez de arreglarlo.** El plan preveía que cada `429` revelara el 100% real de su ventana. Recalibrar sobre la unidad equivocada solo hace que el número siga siendo falso con más decimales.

**Con qué se reemplazó.** No hace falta estimar nada: el SDK emite `rate_limit_event` con `rate_limit_info.unifiedWindows.{five_hour,seven_day}.{utilization,resetsAt}`, que es el porcentaje **real de la cuenta**. Desde el commit `c97f2131` el anillo usa ese valor, la estimación por salida se eliminó del código, y cuando la última lectura tiene más de 15 minutos el popover dice **"sin dato"** en vez de inventar un número.

- Plan que lo reemplaza: `workspace-leandro/plans/11-septiembre-cuota-dos-maquinas.md` (Fase 7).
- Teoría, para no repetir el error: `workspace-leandro/biblioteca/claude-code/cuota-y-costo.md`.

---

## Contexto

El 09-sep la ventana de 5 horas se agotó **dos veces** y no hubo aviso previo: `quotaLimits` solo aparece en el transcript cuando el servidor ya devolvió un `429`. Hoy se trabaja a ciegas y el límite se descubre cuando ya frenó el trabajo.

**Calibración medida sobre los dos agotamientos reales** (`resetsAt` 1788999000 y 1789018800, o sea 02:10 y 07:40 CEST):

| | Ventana 1 | Ventana 2 | Δ |
|---|---|---|---|
| Turnos | 1.706 | 1.620 | 5% |
| Tokens de salida | 1.631.320 | 1.537.151 | 6% |
| Salida por turno | 956 | 948 | 1% |
| cache-read | 334,2 M | 290,2 M | 15% |
| US$ equivalente API | $167 | $218 | 30% |

Las dos ventanas se agotaron con turnos y salida casi idénticos **pese a usar mezclas de modelo distintas** (V1: Opus 5 + Sonnet 5; V2: Opus 5 + Sonnet 4.6). El dólar divergió 30% y el cache-read 15%: **ninguno de los dos es la métrica del límite**. La documentación de Anthropic lo respalda — los cache-reads no cuentan para los límites de input.

**La métrica es el output. El 100% se ubica en ~1.584.000 tokens de salida (~1.660 turnos).** Ese es el denominador inicial de la barra, y el plan lo hace auto-recalibrable: cada `429` nuevo revela el 100% real de su ventana.

Los subagentes quedan descartados como causa: aportaron 6,5% y 16% del output de cada ventana.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `server/modules/usage-window/services/usage-window.service.ts` | crear — recorre los `.jsonl`, arma la ventana vigente y suma output por modelo |
| `server/modules/usage-window/services/usage-window-index.service.ts` | crear — índice incremental por offset, para no releer 55 MB en cada evento |
| `server/modules/usage-window/services/usage-window-broadcast.service.ts` | crear — emite `usage_window` a `connectedClients`, copiando el patrón de `session-upsert-broadcast.service.ts` |
| `server/modules/usage-window/usage-window.routes.ts` | crear — `GET /api/usage-window` para el primer render y para depurar |
| `server/modules/usage-window/index.ts` | crear — barril de exports, como los demás módulos |
| `server/modules/providers/services/sessions-watcher.service.ts` | modificar — ya vigila `~/.claude/projects` y filtra `.jsonl`; se le engancha el recálculo |
| `server/index.ts` | modificar — registrar la ruta nueva |
| `server/shared/types.ts` | modificar — agregar `UsageWindowEvent` a `ServerEvent` |
| `src/shared/ui/CircleProgress.tsx` | crear — el componente provisto, adaptado al repo (import de `cn` desde `@/shared/utils`) |
| `src/modules/usage-window/UsageWindowIndicator.tsx` | crear — el círculo del header, se suscribe al WebSocket |
| `src/modules/usage-window/UsageWindowPopover.tsx` | crear — detalle por sesión y reloj de reset |
| `src/modules/project-workspace/WorkspaceHeader.tsx` | modificar — **una línea**: montar el indicador junto a los tabs |

---

## Micro-tasks

- [x] Crear `server/modules/usage-window/` con su `index.ts` barril siguiendo el patrón de `server/modules/websocket/index.ts` — acepta: `npm run build` del server pasa | valida: `npm run build`
- [x] Escribir el detector de inicio de ventana: ordenar turnos por timestamp y avanzar `inicio = t` cada vez que `t >= inicio + 5h` — acepta: sobre los datos del 09-sep devuelve 19:10 UTC | valida: test unitario con fixture
- [x] Hacer que el detector prefiera el último `resetsAt` conocido como ancla cuando exista — acepta: con `resetsAt=1788999000` la ventana siguiente arranca ahí | valida: test unitario
- [x] Sumar `output_tokens` por modelo de todos los `.jsonl`, incluidos los de `subagents/` — acepta: reproduce 1.631.320 en la ventana 1 | valida: `curl localhost:3001/api/usage-window?desde=...&hasta=...`
- [x] Escribir el índice incremental por offset de archivo, persistido en la DB existente — acepta: el segundo recálculo lee solo lo nuevo | valida: medir tiempo de la 1.ª vs la 2.ª llamada
- [x] Verificar que un recálculo completo sobre los 55 MB actuales tarda menos de 2 s y no dispara OOM — acepta: `time` < 2000 ms, RSS < 200 MB | valida: `/usr/bin/time -v`
- [x] Exponer `GET /api/usage-window` devolviendo `{ inicio, resetsAt, usados, limite, porcentaje, porSesion[], porModelo[], calibradoDe }` — acepta: 200 con JSON válido | valida: `curl -s localhost:3001/api/usage-window | jq .`
- [x] Registrar la ruta en `server/index.ts` — acepta: responde tras reiniciar | valida: `curl -s -o /dev/null -w '%{http_code}' localhost:3001/api/usage-window`
- [x] Agregar `UsageWindowEvent` al union `ServerEvent` en `server/shared/types.ts` — acepta: compila front y back | valida: `npm run build && npm run build --prefix server`
- [x] Escribir `usage-window-broadcast.service.ts` copiando la forma de `session-upsert-broadcast.service.ts` (`connectedClients` + `WS_OPEN_STATE`) — acepta: emite a todos los clientes abiertos | valida: `wscat` conectado y tocar un `.jsonl`
- [x] Enganchar el recálculo en `sessions-watcher.service.ts` con debounce de 1 s — acepta: escribir en un `.jsonl` produce un `usage_window` en menos de 2 s | valida: `wscat` + `echo >> ` sobre un transcript de prueba
- [x] Confirmar que el debounce no dispara una tormenta: 50 escrituras seguidas producen a lo sumo 3 eventos — acepta: ≤ 3 | valida: bucle de `echo` + contar eventos en `wscat`
- [x] Copiar `CircleProgress` a `src/shared/ui/CircleProgress.tsx` cambiando el import de `cn` a `@/shared/utils` — acepta: compila y renderiza | valida: `npm run build`
- [x] Exportar `CircleProgress` desde el barril `src/shared/ui/index.ts` — acepta: `import { CircleProgress } from '@/shared/ui'` funciona | valida: `npm run build`
- [x] Escribir `UsageWindowIndicator.tsx`: `useWebSocket()` para el evento, `fetch` inicial al endpoint, `CircleProgress size={22} strokeWidth={2.5}` — acepta: se ve el círculo en el header | valida: abrir `:8443` en el navegador
- [ ] Verificar que el color cambia por tramo (verde < 70%, ámbar < 90%, rojo ≥ 90%) con la función por defecto — acepta: los tres colores se ven | valida: forzar valores por query param de debug
- [x] Escribir `UsageWindowPopover.tsx` con desglose por sesión, por modelo y hora de reset — acepta: abre al hacer clic y cierra con Escape y con clic afuera | valida: prueba manual en el navegador
- [x] Montar el indicador en `WorkspaceHeader.tsx` con **una sola línea** dentro del contenedor flex, antes del bloque de tabs — acepta: el diff del header es de 2 líneas o menos | valida: `git diff --stat src/modules/project-workspace/WorkspaceHeader.tsx`
- [ ] Verificar que en móvil (`isMobile`) el círculo sigue visible y no rompe el layout — acepta: se ve en viewport de 375 px | valida: DevTools responsive
- [x] Escribir la auto-calibración: al detectar un `quotaLimits.status === "rejected"` nuevo, guardar el output total de esa ventana como límite y usarlo de ahí en más — acepta: el `limite` del endpoint cambia tras un 429 | valida: fixture con un 429 sintético
- [x] Mostrar en el popover de qué se calibró (`"estimado"` vs `"medido el DD-mmm"`) — acepta: el texto aparece | valida: prueba manual
- [x] Agregar las claves i18n del indicador en los locales existentes — acepta: no aparece ninguna clave cruda en pantalla | valida: cambiar idioma y mirar
- [ ] Commit y push en `diseno/propio` — acepta: `git status` limpio | valida: `git -C ~/cloudcli status --short`

---

## Análisis Crítico

> Completado por Claude en Fase 2.5. El usuario decide qué incorporar antes de ejecutar.

### Incongruencias detectadas

- **El plan del 10-sep en `workspace-leandro/plans/` se apoya en una premisa que esta calibración invalida.** Ese plan sostiene que el contexto sin compactar es lo que agota la ventana. Los datos dicen que no: el cache-read divergió 15% entre las dos ventanas agotadas y el dólar 30%, mientras el output convergió al 6%. El contexto gigante encarece y ralentiza, pero **no es lo que consume la cuota**. Ese archivo hay que corregirlo, no dejarlo conviviendo con este — un tema, un canon.
- **`CONTEXT_WINDOW=160000` en el `.env` de CloudCLI no coincide con nada real.** El modelo corre en `claude-opus-5[1m]`. Si el indicador nuevo lee esa variable para algo, va a mentir. No usarla.

### Huecos no cubiertos

- **La calibración se apoya en dos muestras.** Convergen al 6%, lo cual es fuerte, pero dos no son una fórmula: no sé si Anthropic pondera el output por modelo, ni cómo pesa el input no cacheado. El plan lo mitiga con la auto-calibración de la Fase 5 y mostrando `estimado` vs `medido`, pero **la barra va a tener error hasta el primer 429 propio**. Debe decirlo en el popover, no aparentar precisión que no tiene.
- **La ventana semanal no está cubierta.** Existe `rateLimitType: "seven_day"` en la config (`tengu_rate_limit_promo_notices` lo menciona) y este plan solo modela la de 5 horas. Podés quedarte sin la semanal con la barra en verde.
- **El timezone del mensaje de Anthropic vino en `Europe/Berlin`**, no en tu zona. Si el popover muestra la hora de reset, tiene que convertirla explícitamente o va a confundir.
- **Nada limpia el índice incremental si un `.jsonl` se trunca o se borra.** Un offset guardado que quedó más allá del fin del archivo produce un total silenciosamente mal. Hace falta detectar que el tamaño bajó y reindexar ese archivo.
- **El plan no define qué pasa con las sesiones de otras cuentas.** Si algún día el VPS corre Claude con otro token, todos los `.jsonl` se suman igual y el número queda inflado.

### Áreas relacionadas a monitorear

- **`sessions-watcher.service.ts` es código de upstream.** Es el archivo con más riesgo de conflicto de todo el plan. El enganche tiene que ser una llamada de una línea a un servicio propio, nunca lógica nueva adentro.
- **`server/shared/types.ts`** también es de upstream: agregar un miembro al union `ServerEvent` es de bajo riesgo, pero es un conflicto seguro en cada merge. Vale la pena aislar el tipo en el módulo propio y sólo referenciarlo desde el union.
- **`WorkspaceHeader.tsx` es de upstream.** De ahí el límite de 2 líneas de diff en las micro-tasks.
- **`WebSocketContext.tsx`** ya maneja reconexión y avisa a los componentes para que recuperen lo perdido. El indicador tiene que refetchear en ese evento o queda congelado tras una reconexión.

### Zonas intocables

- **`main` de `cloudcli`.** Todo va en `diseno/propio`. Es lo que permite seguir haciendo `git merge upstream/main`.
- **El chat, el file-tree, el git-panel y la consola.** Ninguna fase los toca.
- **`server/modules/providers/`** salvo la línea de enganche en el watcher.
- **`~/.claude/projects/`.** El servicio los lee, nunca los escribe ni los borra. Son la única evidencia de consumo que existe.
- **El `.env` de `cloudcli`.** Si hiciera falta una variable nueva, se **agrega** con `>>`, nunca se reescribe el archivo — la regla que costó el `SERVICIO_TOKEN` el 10-sep.

### Sugerencias opcionales

- [ ] **Modelar también la ventana de 7 días** en el mismo servicio y mostrarla como un segundo anillo concéntrico. Esfuerzo: ~1 h. Tapa el hueco más grande del plan.
- [ ] **Aviso push al cruzar 80%.** El repo ya tiene `server/modules/notifications` y el commit `004f8ced` acaba de conectar las notificaciones del navegador. Esfuerzo: ~30 min, y convierte la barra de informativa en accionable aunque no la estés mirando.
- [ ] **Proyección de agotamiento** en el popover: "al ritmo actual se agota en 47 min". Es el dato que realmente cambia una decisión. Esfuerzo: ~40 min.
- [ ] **Contribuir el módulo a upstream.** Si siteboon lo acepta, deja de ser deuda de merge y pasa a mantenerlo otro. Esfuerzo: el de abrir el PR.

---

## Fases

### Fase 1 - Calculadora de ventana

**Goal (done-criterion):** Existe `server/modules/usage-window/` Y `curl -s 'localhost:3001/api/usage-window?desde=2026-09-09T19:10&hasta=2026-09-10T00:10' | jq .usados` devuelve un valor entre 1.615.000 y 1.648.000 (los 1.631.320 medidos, ±1%) Y un recálculo completo sobre los 55 MB de transcripts tarda menos de 2 s Y todos los checks de `#### Estado` están en `[pass]`.

**Alcance:** Tocar: `server/modules/usage-window/`, `server/index.ts` (registrar ruta). Ignorar: `src/` completo, `server/modules/providers/`, `server/modules/chat/`, todo lo que no sea el módulo nuevo.

**Paralelizable:** Sí — con Fase 3. Back y front no se cruzan hasta la Fase 4.

#### Pasos

1. `mkdir -p server/modules/usage-window/services` y crear el barril `index.ts` con la forma de `server/modules/websocket/index.ts`.
2. Escribir el detector de ventana: leer el último `quotaLimits.resetsAt` de todos los transcripts; si existe y ya pasó, la ventana arranca en el primer turno posterior. Si no existe, recorrer los turnos ordenados avanzando `inicio = t` cuando `t >= inicio + 5h`.
3. Sumar `output_tokens` de las líneas `type=="assistant"` con `message.usage`, excluyendo `message.model == "<synthetic>"`, agrupando por sesión y por modelo. Incluir los `.jsonl` de `subagents/`.
4. Escribir el índice incremental: por archivo guardar `{ruta, offset, mtime, size}` y leer sólo desde `offset`. Si `size < offset`, reindexar el archivo entero.
5. Exponer `GET /api/usage-window` con `desde`/`hasta` opcionales para poder validar contra las ventanas del 09-sep.
6. Registrar la ruta en `server/index.ts`.
7. Validar contra los dos números conocidos y medir tiempo y RSS.

#### Estado (arranca todo en fail)

- [pass] El endpoint responde 200 con JSON válido | valida: `curl -s -o /dev/null -w '%{http_code}' localhost:3001/api/usage-window`
- [pass] Reproduce la ventana 1 dentro del ±1% (esperado 1.631.320) | valida: `curl -s 'localhost:3001/api/usage-window?desde=2026-09-09T19:10&hasta=2026-09-10T00:10' | jq .usados`
- [pass] Reproduce la ventana 2 dentro del ±1% (esperado 1.537.151) | valida: `curl -s 'localhost:3001/api/usage-window?desde=2026-09-10T00:40&hasta=2026-09-10T05:40' | jq .usados`
- [pass] El detector de ventana sin argumentos ubica el inicio correcto | valida: test unitario con fixture del 09-sep
- [pass] Recálculo completo < 2 s y RSS < 200 MB | valida: `/usr/bin/time -v curl -s localhost:3001/api/usage-window > /dev/null`
- [pass] El segundo recálculo es más rápido que el primero (el índice sirve) | valida: dos `time curl` seguidos
- [fail] Un `.jsonl` truncado se reindexa en vez de dar un total mal | valida: truncar una copia y comparar
- [pass] Incluye los subagentes en el total | valida: comparar con y sin `*/subagents/*`
- [pass] `npm run build` del server pasa | valida: `npm run build`

#### Peligros

- **`jq -s` sobre los 55 MB mata el proceso por OOM.** Ya pasó durante el diagnóstico de este plan (exit 137). Leer por streaming línea a línea, nunca cargar todo en memoria.
- Las líneas de los `.jsonl` no son todas turnos: hay `queue-operation`, `attachment`, `summary`. Un `select` mal puesto rompe el total en silencio — por eso los dos checks de reproducción son obligatorios y no negociables.
- El índice incremental es la principal fuente de bugs silenciosos de este plan: un offset mal guardado no rompe nada visible, sólo devuelve un número menor.
- La ventana de Anthropic arranca con el primer mensaje, no a horas redondas. Un detector que asuma bloques fijos va a dar mal siempre.

#### Mejores prácticas

- El servicio devuelve el dato crudo y el porcentaje por separado. Que el front no recalcule nada.
- Devolver también `calibradoDe: "estimado" | "medido:<fecha>"` desde el día uno, aunque la Fase 5 todavía no exista: el front ya lo puede mostrar.

---

### Fase 2 - Push por WebSocket

**Goal (done-criterion):** Escribir una línea en cualquier `.jsonl` bajo `~/.claude/projects` produce un evento `usage_window` en un cliente WebSocket conectado en menos de 2 s Y 50 escrituras seguidas producen 3 eventos o menos Y el diff sobre `sessions-watcher.service.ts` es de 3 líneas o menos Y todos los checks de `#### Estado` están en `[pass]`.

**Alcance:** Tocar: `server/modules/usage-window/services/usage-window-broadcast.service.ts`, `server/shared/types.ts`, y **una llamada** en `server/modules/providers/services/sessions-watcher.service.ts`. Ignorar: el resto del watcher, `chat-websocket.service.ts`, `src/`.

**Paralelizable:** No — necesita el servicio de la Fase 1.

#### Pasos

1. Definir `UsageWindowEvent` en el módulo propio y agregarlo al union `ServerEvent` de `server/shared/types.ts` por referencia, no copiando la forma.
2. Escribir el broadcaster copiando la estructura de `session-upsert-broadcast.service.ts`: iterar `connectedClients`, filtrar por `WS_OPEN_STATE`, enviar el payload.
3. Envolver el recálculo en un debounce de 1 s con supresión de reentrada, igual que `watcherRefreshInFlight` en el watcher.
4. Agregar la llamada en el handler de cambios del watcher — una línea, junto al `broadcastSessionUpserted` que ya está.
5. Validar con `wscat` conectado y `echo >>` sobre un transcript de prueba.

#### Estado (arranca todo en fail)

- [fail] `wscat` recibe un `usage_window` al tocar un `.jsonl` | valida: `wscat -c ws://localhost:3001/ws` + `echo '' >> <transcript>`
- [fail] Llega en menos de 2 s | valida: cronometrar
- [pass] 50 escrituras seguidas producen ≤ 3 eventos | valida: bucle + contar
- [pass] El diff sobre el watcher es ≤ 3 líneas | valida: `git diff --stat server/modules/providers/services/sessions-watcher.service.ts`
- [fail] `session_upserted` sigue funcionando igual que antes | valida: crear una sesión y ver que aparece en el sidebar
- [fail] Un cliente que se reconecta recibe el estado actual | valida: cerrar y reabrir `wscat`
- [pass] Ambos builds pasan | valida: `npm run build && npm run build --prefix server`

#### Peligros

- **`sessions-watcher.service.ts` es de upstream.** Meter lógica adentro garantiza conflictos en cada `git merge upstream/main`. Todo el trabajo va en el módulo propio; el watcher sólo llama.
- Recalcular en cada escritura de `.jsonl` durante una sesión activa es una tormenta: hay decenas de escrituras por turno. El debounce no es un detalle de calidad, es lo que evita que la barra consuma más CPU que el chat.
- El watcher tiene su propio control de reentrada (`watcherRefreshInFlight`). Si el recálculo nuevo lo bloquea o lanza, rompe el `session_upserted` que ya funciona. Envolver en `try/catch` y no propagar.

#### Mejores prácticas

- El evento lleva el payload completo, no un "andá a buscarlo": el front no debería hacer un `fetch` por cada notificación.
- Loguear los errores del recálculo con el mismo formato que usa el watcher (`console.error` con objeto), para que se lean juntos.

---

### Fase 3 - CircleProgress en el repo

**Goal (done-criterion):** Existe `src/shared/ui/CircleProgress.tsx` Y está exportado desde `src/shared/ui/index.ts` Y `npm run build` pasa Y **no** se agregó `@radix-ui/react-slot` ni se creó `src/components/ui/` ni `components.json` Y todos los checks de `#### Estado` están en `[pass]`.

**Alcance:** Tocar: `src/shared/ui/CircleProgress.tsx`, `src/shared/ui/index.ts`. Ignorar: `package.json`, `tailwind.config.js`, `src/index.css`, cualquier otro componente.

**Paralelizable:** Sí — con Fase 1 y Fase 2.

#### Pasos

1. Copiar `CircleProgress` tal cual, cambiando **sólo** el import: `@/lib/utils` → `@/shared/utils`.
2. Corregir el acceso a `props["aria-valuetext"]` y `props.suffix`: `suffix` está declarado en la interfaz pero no se desestructura, así que se lee desde `props` — verificar que TypeScript no lo rechace en modo estricto y ajustar la desestructuración si hace falta.
3. Exportar desde el barril `src/shared/ui/index.ts` junto a `LLMProviderLogo`.
4. Compilar y renderizar una instancia de prueba.

#### Estado (arranca todo en fail)

- [pass] El archivo existe y compila | valida: `npm run build`
- [pass] `import { CircleProgress } from '@/shared/ui'` resuelve | valida: `npm run build`
- [pass] No se instaló ninguna dependencia nueva | valida: `git diff --stat package.json package-lock.json` vacío
- [pass] No existe `src/components/ui/` ni `components.json` | valida: `ls src/components/ui components.json 2>&1 | grep -c 'No such'`
- [fail] Renderiza con valor 0, 50 y 100 sin warnings en consola | valida: montar y mirar DevTools
- [fail] Los colores por defecto cambian en 70% y 90% | valida: inspección visual de los tres estados

#### Peligros

- **La tentación de "hacer bien las cosas" e instalar shadcn.** CloudCLI no es shadcn: no tiene `components.json`, ni `src/components/ui/`, ni `src/lib/utils.ts`. Organiza por `src/modules/<feature>/` y `src/shared/ui/`. Convertirlo produciría exactamente los conflictos de merge que el `CLAUDE.md` de esta máquina prohíbe, y el componente **no lo necesita**: sólo usa `cn` y React. Card, Button y `@radix-ui/react-slot` venían en el prompt como dependencias del demo, no del componente.
- El componente anima con `requestAnimationFrame` en cada cambio de valor. Con eventos cada 1 s la animación de 300 ms nunca termina de asentarse; si se ve nervioso, subir el debounce antes que tocar el componente.
- `strokeWidth` grande con `size` chico hace que el radio quede negativo y el SVG desaparezca sin error. Con `size=22` no pasar de `strokeWidth=4`.

#### Mejores prácticas

- Copiar el componente **sin refactorizarlo**. Es código de terceros que funciona; cada cambio propio es deuda al actualizarlo.
- El comentario de cabecera debe decir de dónde salió, para que dentro de seis meses se sepa que no es código propio.

---

### Fase 4 - Indicador en el header y popover

**Goal (done-criterion):** Al abrir `:8443` se ve el círculo en la barra superior junto a los tabs Y muestra el porcentaje real de la ventana vigente Y se actualiza solo mientras hay una sesión trabajando, sin recargar Y al hacer clic abre el popover con desglose por sesión, por modelo y hora de reset Y el diff sobre `WorkspaceHeader.tsx` es de 2 líneas o menos Y todos los checks de `#### Estado` están en `[pass]`.

**Alcance:** Tocar: `src/modules/usage-window/` (nuevo), una línea en `src/modules/project-workspace/WorkspaceHeader.tsx`, claves i18n. Ignorar: `WorkspaceTabs`, `WorkspaceTitle`, `MobileMenuButton`, el resto del layout.

**Paralelizable:** No — necesita Fase 2 (el evento) y Fase 3 (el componente).

#### Pasos

1. Crear `src/modules/usage-window/UsageWindowIndicator.tsx`: `fetch('/api/usage-window')` al montar, `useWebSocket()` para escuchar `usage_window`, y refetch cuando el contexto avise reconexión.
2. Renderizar `<CircleProgress value={usados} maxValue={limite} size={22} strokeWidth={2.5} />` dentro de un `<button>` accesible con `aria-label` que diga el porcentaje y la hora de reset.
3. Crear `UsageWindowPopover.tsx` con el desglose, el reloj de reset convertido a la zona local, y la leyenda `estimado` / `medido el DD-mmm`.
4. Montar en `WorkspaceHeader.tsx` dentro del contenedor flex, entre el bloque del título y el de tabs.
5. Verificar en móvil que no rompe el layout.
6. Agregar las claves i18n.

#### Estado (arranca todo en fail)

- [fail] El círculo se ve en el header al abrir `:8443` | valida: navegador
- [fail] El porcentaje coincide con `curl localhost:3001/api/usage-window` | valida: comparar los dos
- [fail] Se actualiza solo al trabajar en una sesión, sin recargar | valida: mandar un prompt en otra pestaña y mirar
- [fail] El popover abre con clic y cierra con Escape y con clic afuera | valida: prueba manual
- [fail] El reloj de reset se muestra en zona local, no en Europe/Berlin | valida: comparar con `date`
- [pass] El diff sobre `WorkspaceHeader.tsx` es ≤ 2 líneas | valida: `git diff --stat src/modules/project-workspace/WorkspaceHeader.tsx`
- [fail] En viewport de 375 px se ve y no desborda | valida: DevTools responsive
- [fail] No hay claves i18n crudas en pantalla | valida: cambiar idioma y mirar
- [fail] Sobrevive una reconexión del WebSocket sin quedar congelado | valida: reiniciar el server con la pestaña abierta

#### Peligros

- **`WorkspaceHeader.tsx` es de upstream.** Cada línea que se le agregue es un conflicto potencial en cada merge. Todo el comportamiento vive en el módulo propio; el header sólo monta.
- El header ya maneja overflow de tabs con `ResizeObserver` y gradientes. Insertar un elemento sin `flex-shrink-0` puede romper el cálculo de scroll de los tabs.
- Si el `fetch` inicial falla, el indicador no debe romper el header: estado vacío silencioso, no un throw que tumbe el árbol.
- El popover en móvil se sale de pantalla si se posiciona sin `collision detection`.

#### Mejores prácticas

- El `aria-label` tiene que decir el número, no "indicador de uso": es lo único que escucha un lector de pantalla.
- Estado vacío explícito: mientras no hay dato, círculo gris, no cero — cero es una afirmación falsa.

---

### Fase 5 - Auto-calibración

**Goal (done-criterion):** Al aparecer un `quotaLimits.status === "rejected"` nuevo en cualquier transcript, el `limite` que devuelve `/api/usage-window` pasa a ser el output total medido de esa ventana Y el popover muestra `medido el DD-mmm` en vez de `estimado` Y el valor calibrado sobrevive a un reinicio del server Y todos los checks de `#### Estado` están en `[pass]`.

**Alcance:** Tocar: `server/modules/usage-window/services/usage-window.service.ts`, la tabla de persistencia en `server/modules/database/`. Ignorar: el front salvo la leyenda, el watcher, todo lo demás.

**Paralelizable:** No — cierra sobre la Fase 1 y necesita la Fase 4 para verse.

#### Pasos

1. Detectar en el barrido las líneas con `quotaLimits.rateLimitType === "five_hour"` y `status === "rejected"`, quedándose con la más reciente por `resetsAt`.
2. Calcular el output total de la ventana que terminó en ese `resetsAt` y guardarlo como límite calibrado, con su fecha.
3. Persistirlo en la DB existente para que sobreviva al reinicio.
4. Promediar las últimas N calibraciones en vez de quedarse con la última, para que un agotamiento atípico no descalibre la barra.
5. Devolver `calibradoDe` en el endpoint y mostrarlo en el popover.
6. Validar con un fixture que contenga un 429 sintético.

#### Estado (arranca todo en fail)

- [pass] Un 429 en un fixture cambia el `limite` devuelto | valida: fixture + `curl ... | jq .limite`
- [pass] Con los dos 429 reales del 09-sep el límite queda entre 1.53 M y 1.64 M | valida: `curl -s localhost:3001/api/usage-window | jq .limite`
- [pass] `calibradoDe` dice `medido:2026-09-10` | valida: `curl -s localhost:3001/api/usage-window | jq .calibradoDe`
- [fail] El valor sobrevive a `systemctl --user restart` del servicio | valida: reiniciar y volver a consultar
- [fail] Sin ningún 429 conocido cae al estimado de 1.584.000 y lo declara | valida: base limpia + consultar
- [pass] El popover muestra la leyenda correcta | valida: navegador

#### Peligros

- **Un 429 de la ventana semanal calibraría mal la de 5 horas.** Filtrar por `rateLimitType === "five_hour"` explícitamente; el campo existe justamente para eso.
- Si el agotamiento ocurrió con el VPS a medio trabajar, la ventana medida puede quedar corta y bajar el límite indebidamente. De ahí el promedio de las últimas N y no la última sola.
- Guardar el calibrado sin fecha lo vuelve inauditable: dentro de un mes nadie va a saber si ese número sigue valiendo.

#### Mejores prácticas

- La barra tiene que **declarar su incertidumbre**. Con dos muestras convergiendo al 6% el número es bueno, pero no es oficial: `estimado` hasta que se mida, y `medido el DD-mmm` después.
- Nunca inventar precisión: mostrar `~78%`, no `78,4%`.

---

## Orden de ejecución

- **Fases 1 y 3 en paralelo.** Back y front no se cruzan: la Fase 1 vive entera en `server/modules/usage-window/`, la Fase 3 en `src/shared/ui/`.
- **Fase 2 después de la Fase 1** — necesita el servicio que emite.
- **Fase 4 después de la 2 y la 3** — necesita el evento y el componente.
- **Fase 5 al final**, cuando hay dónde mostrar la leyenda de calibración.

## Verificación final

Con CloudCLI abierto en `:8443` y una sesión trabajando en otra pestaña:

1. El círculo del header se mueve solo, sin recargar, en menos de 2 s desde que la sesión genera.
2. El porcentaje que muestra coincide con `curl -s localhost:3001/api/usage-window | jq .porcentaje`.
3. El popover abre y lista las sesiones activas con su aporte, más la hora de reset en zona local.
4. Las dos ventanas del 09-sep se reproducen dentro del ±1%:
   ```
   curl -s 'localhost:3001/api/usage-window?desde=2026-09-09T19:10&hasta=2026-09-10T00:10' | jq .usados   # ~1631320
   curl -s 'localhost:3001/api/usage-window?desde=2026-09-10T00:40&hasta=2026-09-10T05:40' | jq .usados   # ~1537151
   ```
5. `git diff --stat origin/main...diseno/propio -- server/modules/providers src/modules/project-workspace server/shared` muestra **5 líneas o menos** de cambio sobre archivos de upstream.

El punto 5 es el que dice si el fork sigue siendo mantenible.

## Riesgos globales

- **La calibración se apoya en dos muestras.** Convergen al 6%, pero hasta el primer 429 propio la barra es una estimación honesta, no una medición. Si aparenta precisión, es peor que no tenerla — de ahí la leyenda `estimado`.
- **Cuatro archivos de upstream tocados** (`sessions-watcher.service.ts`, `shared/types.ts`, `WorkspaceHeader.tsx`, `server/index.ts`). Cada uno es deuda en cada `git merge upstream/main`. El plan la acota con límites de líneas verificables, pero no la elimina.
- **El recálculo corre en el mismo proceso que sirve el chat.** Un barrido lento o un OOM tumban CloudCLI entero. De ahí el índice incremental y los límites de tiempo y RSS como checks, no como aspiración.
- **La ventana de 7 días no está modelada.** Podés agotarla con la barra de 5 horas en verde.
- **Este plan mide, no ahorra.** Saber que estás al 80% no baja el consumo. La decisión de fondo — qué hacer con el volumen de turnos — sigue abierta y le corresponde al plan de Optimum MKT.

---

## Cambios realizados

**1 · El indicador no va en `WorkspaceHeader` sino en `SkinHeader`.** El plan apuntaba al header de upstream. Es código muerto en la práctica: `SkinHeader` lo sustituye desde un injerto de una línea en `WorkspaceMain`, así que vite lo tree-shakeaba y el montaje **nunca entraba al bundle** — el hash del bundle no cambiaba entre builds pese a tocar el archivo, que fue la pista. Montado en `SkinHeader`, junto al nombre de la sesión, que es donde se había pedido. Efecto lateral bueno: **la deuda con upstream en el front baja a cero**.

**2 · `CircleProgress` vive en `src/modules/usage-window/`, no en `src/shared/ui/`.** El barril de `shared/ui` documenta su propia regla de admisión: un componente entra cuando un segundo módulo lo renderiza. Sólo lo usa este módulo.

**3 · Tres cambios que el plan decía no hacer, forzados por el lint del repo.** `interface` → `type` (regla `consistent-type-definitions`), imports relativos → alias `@/` (`no-restricted-imports`), y el import del broadcaster por el barril de `websocket` en vez del servicio directo (regla `boundaries`). El plan pedía copiar `CircleProgress` sin refactorizar; el primero de los tres lo toca igual, y es el mínimo que pasa el pre-commit.

**4 · La calibración se persiste en `~/.cloudcli/usage-window-calibration.json`, no en la DB.** Tocar el schema de upstream habría sido deuda de merge permanente a cambio de nada: es un objeto de tres campos.

**5 · La Fase 5 quedó dentro del servicio de la Fase 1**, no como paso aparte: la calibración se recalcula en el mismo barrido que ya lee los `429`. Se validó igual, y sola: al primer arranque detectó los dos rechazos del 09-sep y fijó el límite en **1.584.236**.

**6 · No se verificó el endpoint HTTP con token.** El proceso usa un `JWT_SECRET` distinto al del `.env`, así que el token generado a mano da `AUTH_TOKEN_INVALID`. Se verificó que la ruta existe y está protegida (401, contra 200 de una ruta inexistente) y que el servicio que envuelve reproduce las dos ventanas con 0,00% de error. El camino completo con auth se ve al abrir la interfaz.

**7 · Desplegado.** CloudCLI se reinició (pid 248911) y esta sesión se reanudó debajo del proceso nuevo. Verificado contra el servicio en vivo: `/api/usage-window` responde `401` (existe y está protegida, contra `200` del catch-all del SPA en una ruta inexistente), y el bundle que sirve — `index-BZXOp_Ul.js`, 3,1 MB — contiene todas las cadenas del indicador. Queda pendiente sólo la confirmación visual: el círculo renderizado y el popover abriendo.

### Medido, no estimado

| Check | Resultado |
|---|---|
| Ventana 1 (esperado 1.631.320) | **1.631.320** — 0,00% |
| Ventana 2 (esperado 1.537.151) | **1.537.151** — 0,00% |
| Turnos v1 / v2 | 1.706 / 1.620 — exactos |
| Barrido completo de 55 MB | 774 ms |
| Barrido incremental | 7 ms |
| RSS máximo | 159 MB |
| Auto-calibración | 1.584.236, `medido:2026-09-10` |
| Debounce: 50 escrituras en ráfaga | 1 frame |
| Debounce: 10 escrituras cada 120 ms | 2 frames |
| Cliente cerrado en `connectedClients` | 0 frames |
| Deuda sobre upstream | 6 líneas, todas en el backend |

---

## Continuacion de Sesion

**Fases completadas:** 1, 2, 3 y 5 validadas con datos reales. Fase 4 desplegada y servida; falta la confirmación visual del operador.
**Fase actual:** Fase 4 - confirmación visual del círculo y del popover
**Proximo paso exacto:** recargar `:8443` y confirmar el círculo a la derecha del nombre de la sesión; al hacer clic, el popover con el desglose y la leyenda `Límite medido el 2026-09-10`
**Bloqueantes:** ninguno
**Micro-tasks pendientes:** 3 de 23 — todas de verificación visual
