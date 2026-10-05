# Design Tokens

## Espaciado (base 4px)

| Token | Valor | Uso |
|---|---|---|
| `space-1` | 4px | Micro separación (ícono-texto en un chip) |
| `space-2` | 8px | Padding interno chico, gap entre línea de actividad y su ícono |
| `space-3` | 12px | Padding de un chip/badge |
| `space-4` | 16px | Padding estándar de card, gutter lateral a 390px (REGLA del plan: 16px de margen, sin scroll horizontal) |
| `space-6` | 24px | Separación entre turnos del chat |
| `space-8` | 32px | Padding del header, padding lateral a ≥768px |
| `space-16` | 64px | Separación entre secciones grandes (splash) |

## Radios

Igual que Optimum: nada de `rounded-full` salvo avatares/pills; las cards usan `8px`, no `16px`+ (ese nivel de redondeo es lo que hoy hace sentir a las tarjetas de tool como "cromo por todos lados" — línea base, punto 1).

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | 6px | Botón, input, badge (`ChatClaude.tsx` usa `rounded-[6px]` en los botones del aviso de sesión fría) |
| `radius-md` | 8px | Card, burbuja de usuario, chip (`rounded-lg`/`rounded-[8px]` de Optimum) |
| `radius-lg` | 12px | Panel flotante, popover, modal en escritorio |
| `radius-full` | 9999px | Avatar (si lo hay en la sidebar), dot de estado de sesión |

## Sombras

Una sola sombra dominante, nunca sombra + glow + borde a la vez (anti-patrón "double embedding" de `ui-ux-pro-max`).

| Token | Valor | Uso |
|---|---|---|
| `shadow-card` | `0 1px 2px rgb(20 33 61 / 0.04), 0 2px 8px rgb(20 33 61 / 0.06)` | Card en reposo (igual a `boxShadow.card` de Optimum) |
| `shadow-card-hover` | `0 4px 12px rgb(20 33 61 / 0.10)` | Card con hover/foco |
| `shadow-float` | `0 8px 24px rgb(20 33 61 / 0.14)` | Panel flotante (diagnóstico, popover de modelo) |

En oscuro la opacidad sube (un gris semitransparente contra `#0B1220` casi no se ve): `0 1px 2px rgb(0 0 0 / 0.3), 0 2px 10px rgb(0 0 0 / 0.35)` para `shadow-card`.

## Materiales (Apple §12)

No son sombra ni color — son una tercera capa, solo en header y composer (los dos elementos que quedan fijos mientras el contenido hace scroll debajo).

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `material-chrome` | `background: rgb(255 255 255 / 0.72); backdrop-filter: blur(20px) saturate(180%);` | `background: rgb(11 18 32 / 0.72); backdrop-filter: blur(20px) saturate(180%);` | Header, composer |
| `material-edge` | `border-top: 1px solid rgb(255 255 255 / 0.5)` | `border-top: 1px solid rgb(255 255 255 / 0.06)` | Borde superior del composer (el "filo de luz" del material) |

Con `prefers-reduced-transparency: reduce`, `material-chrome` pasa a opaco (`background: var(--surface-2); backdrop-filter: none;`).

## Movimiento (Apple §4, §14)

| Token | Damping | Response | Uso |
|---|---|---|---|
| `motion-default` | 1.0 (crítico, sin rebote) | 0.3–0.4s | Aparición de un turno nuevo, apertura de un plegable, cambio de estado de una sesión en la barra |
| `motion-sheet` | 0.8 | 0.3s | Panel/drawer que entra desde un borde (diagnóstico de conexión, panel de salidas) |
| `motion-momentum` | 0.8 | 0.3–0.4s | Solo si el gesto que lo dispara tiene velocidad propia (un swipe que cierra algo) — no hay en el chat hoy |

Con `prefers-reduced-motion: reduce`, todo lo de arriba cae a un cross-fade de opacidad de 150–200ms, sin transform (Apple §14).

## Z-Index

| Capa | Valor |
|---|---|
| Base (columna de chat) | 0 |
| Barra lateral | 10 |
| Header/composer (material) | 20 |
| Indicador de actividad flotante | 25 |
| Dropdown (selector de modelo) | 30 |
| Popover/diagnóstico | 40 |
| Modal/cuestionario a pantalla completa | 50 |
| Toast | 60 |

## Breakpoints

| Nombre | Valor | Nota |
|---|---|---|
| Móvil | 390px | El ancho que usa el arnés E2E (`VIEWPORTS.movil`, `e2e/lib/navegador.mjs`) — no 375px |
| Tablet | 768px | La barra deja de ocultarse sola |
| Desktop | 1024px | Columna de chat llega a su `max-w-3xl` completo |
| Wide | 1280px | El ancho que usa el arnés E2E (`VIEWPORTS.escritorio`) |
| Wide+ | 1440px | Tope de la checklist de `ui-ux-pro-max` — igual que 1280 en este diseño (la columna no crece más, solo el margen) |
