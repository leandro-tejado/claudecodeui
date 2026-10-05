# Tipografía

## Familias

Una sola sans, como en Optimum (`ChatClaude.tsx`/`MensajeMarkdown.tsx` no tocan `font-serif` en ningún lado — es `MessageComponent.tsx` de CloudCLI, líneas 148-151 y 431, quien mete Merriweather; eso sale en la Fase 11).

- **Única familia (UI + respuestas):** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` — la fuente del sistema, como pide `apple-design` (§15: "Default al system font antes de una custom"; ya trae optical sizing y tracking tunado por plataforma). Cero carga de red, cero flash de fuente.
- **Mono (solo para rutas de archivo, ids, código inline):** `ui-monospace, "SF Mono", "Cascadia Code", monospace`.

Nada de Google Fonts ni de `@font-face`: a diferencia del sitio de Optimum (que sí importa una variable `--font-sans`), CloudCLI es una app que vive detrás de login — no hay layout shift que cuidar contra un visitante que nunca vio la página, así que el system font gana directo sin el paso intermedio.

## Escala

Mismos tamaños que `MensajeMarkdown.tsx` (no una escala nueva — es la que ya probamos en Optimum). `leading` baja con el tamaño (Apple §15: tracking apretado y leading suelto en texto grande, al revés en texto chico).

| Token | Tamaño | Line-height | Letter-spacing | Weight | Uso |
|---|---|---|---|---|---|
| `text-label` | 11.5px | 1.3 | +0.07em | 700 (uppercase) | Rótulo de sección (`h3` de Markdown), metadatos de tool |
| `text-xs` | 12px | 1.4 | 0 | 400–500 | Timestamps, badges, contador de cuota |
| `text-compact` | 13px | 1.5 | 0 | 400 | Mensaje en panel angosto (`compacto` de `MensajeMarkdown`) |
| `text-sm` | 14px | 1.5 | 0 | 400–500 | UI de chrome: sidebar, botones, header |
| `text-body` | 15px | 1.75 | 0 | 400 | Cuerpo de la respuesta — la densidad por defecto del chat |
| `text-h4` | 14.5px | 1.3 | 0 | 600 | `h4`/`h5` de Markdown |
| `text-h3` | 16px | 1.3 | -0.005em | 700 | `h2` de Markdown |
| `text-h2` | 17px | 1.3 | -0.01em | 700 | `h1` de Markdown (el tope — nunca un `<h1>` de navegador a tamaño completo) |
| `text-display` | 22–28px (`clamp`) | 1.15 | -0.02em | 700 | Encabezado de pantalla completa (splash, vacío de sesión nueva) — el único lugar con tracking negativo real |

## Peso como jerarquía, no solo tamaño

Apple §15: "construí la jerarquía con weight + size + leading juntos, no con el tamaño solo". En la práctica:

- Un rótulo de sección sube en peso (700) y baja en tamaño (11.5px) en vez de subir en tamaño.
- El nombre de una tool en la línea de actividad va en `text-sm` 500 (medium), no en bold — el bold se reserva para texto que compite por atención, y la actividad es ambient, no el foco.
- `strong` dentro de una respuesta es `font-bold text-ink` (como en `MensajeMarkdown.tsx:51`), no un cambio de color.

## Dynamic Type / zoom del navegador

Todo el texto en `rem`, el `root` en `100%` (16px): un zoom de navegador o un `font-size` de sistema más grande reescala el layout entero, no solo el texto (Apple §15, "Dynamic Type").
