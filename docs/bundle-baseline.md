# Línea base del bundle del cliente

Medido el 22 de septiembre de 2026, rama `perf/carga-diferida`, commit de partida `dee0703a`.

Sirve para dos cosas: comparar contra ella cuando se termine la carga diferida, y detectar
en el futuro que algo volvió al arranque. El medidor es `scripts/bundle-budget.mjs`.

## Qué se mide

El **camino crítico**: el script de entrada, todos los `modulepreload` que el entry arrastra y
la hoja de estilos. Es lo que el navegador tiene que bajar antes de poder renderizar. Un chunk
que existe en `dist/` pero no aparece acá no cuenta — se baja a demanda, que es exactamente lo
que persigue este trabajo.

## Antes

| Archivo | Crudo | Brotli |
|---|---:|---:|
| `index-Dx650vuH.js` | 3.132.154 B | 701.316 B |
| `vendor-codemirror-CmzL_Gs3.js` | 659.622 B | 190.887 B |
| `vendor-xterm-CS4rQ5Mr.js` | 396.801 B | 75.650 B |
| `index-BKGWIbgU.css` | 211.246 B | 29.221 B |
| `vendor-react-CH9CEzdv.js` | 161.252 B | 46.094 B |
| **Total** | **4.561.075 B** | **1.043.168 B** |

Cinco archivos. El techo del presupuesto queda en **1.366.416 B crudos**, una reducción del 70%.

## Lo que pesa dentro del chunk principal

Del mapa del bundle (`VISUALIZE=1 npm run build:client` → `stats.html`). Son tamaños antes de
la minificación final, así que sirven para ordenar, no como bytes servidos.

### Paquetes de terceros

| Paquete | Peso | Destino |
|---|---:|---|
| `react-scan` | 613,1 KB | **fuera de producción** — es una herramienta de diagnóstico de renders |
| `katex` | 588,0 KB | diferido al primer bloque de fórmulas |
| `refractor` + `react-syntax-highlighter` | 359,3 KB | diferido al primer bloque de código |
| `motion-dom` + `framer-motion` | 390,6 KB | se queda: las animaciones están en toda la interfaz |
| `micromark-core-commonmark` | 107,2 KB | se queda: es el parser de Markdown del chat |
| `jszip` | 95,6 KB | diferido al momento de exportar |
| `tailwind-merge` | 88,1 KB | se queda |
| `lucide-react` | 87,8 KB | se queda: los imports ya son puntuales |
| `dompurify` | 82,1 KB | se queda: sanea cada mensaje |
| `i18next` | 78,3 KB | se queda (el motor; los idiomas no, ver abajo) |

### Código propio

| Módulo | Peso | Destino |
|---|---:|---|
| `src/modules/i18n` | 577,3 KB | **11 idiomas importados estáticamente para usar uno** |
| `src/modules/chat` | 519,4 KB | se queda: es la primera pantalla |
| `src/modules/sidebar` | 200,6 KB | se queda |
| `src/modules/git-panel` | 149,8 KB | candidato a diferir |
| `src/modules/settings` | 143,8 KB | candidato a diferir |
| `src/modules/shell` | 70,3 KB | diferido (Fase 3) |
| `src/modules/code-editor` | 65,3 KB | diferido (Fase 4) |

**Los dos hallazgos grandes no estaban en el plan original:** `react-scan`, que ya tenía fase
propia pero pesa mucho más de lo previsto, y los 11 idiomas de `i18n/config.ts` — `de`, `en`,
`es`, `fr`, `it`, `ja`, `ko`, `ru`, `tr`, `zh-CN`, `zh-TW`, cada uno con sus 7-8 archivos JSON,
todos con `import` estático. Un usuario baja diez juegos de traducciones que nunca va a leer.

## Después

Medido el 22 de septiembre de 2026 sobre el commit `e040e81b`, con el mismo script.

| Archivo | Crudo | Brotli |
|---|---:|---:|
| `index-hGO6Hrpt.js` | 1.183.670 B | 270.921 B |
| `index-BUWjjL27.css` | 177.451 B | 21.273 B |
| `vendor-react-svtQNdUt.js` | 161.240 B | 46.098 B |
| **Total** | **1.522.361 B** | **338.292 B** |

Tres archivos en vez de cinco, y un solo `modulepreload` en vez de tres.

| | Antes | Después | Reducción |
|---|---:|---:|---:|
| Crudo | 4.561.075 B | 1.522.361 B | **−66,6%** |
| Brotli (lo que viaja) | 1.043.168 B | 338.292 B | **−67,5%** |

Los tres bytes brotli son los que devuelve el servidor del VPS, verificados con
`curl -sI -H 'Accept-Encoding: br'`: coinciden exactamente con la medición local.

### El 70% no se alcanzó, y por qué

El techo del presupuesto quedó en **1.700.000 B**, no en los 1.366.416 B que fijaba el objetivo
del 70%. Lo que falta para llegar no es peso diferible: es la primera pantalla.

Dentro del chunk de entrada quedan `src/modules/chat` (519 KB) y `src/modules/sidebar` (195 KB),
que son literalmente lo que se ve al abrir; `micromark` (107 KB), que parsea cada mensaje;
`tailwind-merge` (88), `dompurify` (82), `i18next` (78) y `lucide-react` (72), todos usados desde
el primer render; y `react-dropzone` + `file-selector` (105 KB juntos), que viven dentro de un
hook del compositor y no salen sin reescribirlo. A eso se suman 173 KB de CSS de Tailwind, que
el plan excluyó del alcance a propósito.

Diferir cualquiera de esos empeora el primer render en lugar de mejorarlo: cambia bytes por un
esqueleto en la pantalla que el usuario está mirando. El techo se fijó en 1,7 MB —un 12% de aire
sobre lo medido— para que un cambio legítimo no rompa el build, pero sí lo rompa un import
estático olvidado que vuelva a arrastrar un módulo pesado.

### Qué quedó fuera del camino crítico

`mermaid` (593 KB), `katex` (588), `refractor` + `react-syntax-highlighter` (359), `motion` (390),
CodeMirror, xterm, `jszip` y los 10 idiomas que no se están usando. Todos siguen en `dist/`: se
bajan cuando hacen falta, y `PrefetchHeavyChunks` adelanta los más probables en tiempo ocioso
una vez pasado el login.
