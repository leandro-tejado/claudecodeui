# Branding

## Colores — claro

Tokens de marca tal como viven en `app-optimum-mkt/tailwind.config.ts` (no se reinventan: son la referencia).

| Rol | Nombre | Hex | Uso |
|---|---|---|---|
| Primario | `primary` | `#3156FA` | CTAs, acento, foco, link |
| Primario claro | `primary-light` | `#62C3F9` | Hover sobre primario, charts serie 1 |
| Primario oscuro | `primary-dark` | `#2743D6` | Texto/ícono primario sobre fondo claro, active |
| Primario tinte | `primary-tint` | `#EDF1FF` | Fondo del mensaje de usuario, fondo de selección |
| Secundario | `secondary` | `#0891B2` | Acento puntual, charts serie 2 |
| Secundario tinte | `secondary-tint` | `#E6F6FA` | Fondo de chip secundario |
| Texto principal | `ink` | `#141F3D` | Cuerpo, títulos |
| Texto secundario | `muted` | `#5B6B8C` | Metadatos, timestamps, labels |
| Texto terciario | `faint` | `#8A97B0` | Placeholder, deshabilitado |
| Fondo | `surface` | `#FFFFFF` | Fondo de la columna de chat |
| Fondo capa 2 | `surface-2` | `#F4F7FB` | Sidebar, header, chip, hover |
| Fondo capa 3 | `surface-3` | `#EAEEF4` | Bloque dentro de una card, `appbg` |
| Borde | `line` | `#DBE2EC` | Separadores, bordes de card |
| Borde fuerte | `line-strong` | `#C7D0DE` | Borde con más contraste (input con foco perdido) |
| Éxito | `signal-good` | `#15803D` | Sesión libre, turno completo |
| Alerta | `signal-warn` | `#D97706` | Cuota > 75%, esperando permiso |
| Error | `signal-bad` | `#DC2626` | Error de turno, sesión caída |

## Colores — oscuro

No existían en Optimum (la vista `/claude` no tiene modo oscuro propio); se derivan de la misma familia de matiz que `ink`/`primary`, no de un azul-casi-negro genérico — mismo criterio de "material" que el claro, invertido en luminosidad, nunca en matiz.

| Rol | Nombre | Hex | Uso |
|---|---|---|---|
| Primario | `primary` | `#7C9BFF` | CTAs, acento, foco, link (subido en luminosidad para 4.5:1 sobre `surface`) |
| Primario claro | `primary-light` | `#9FD4FF` | Hover sobre primario |
| Primario oscuro | `primary-dark` | `#3156FA` | Fondo de botón primario sólido (el tono "de día" sirve de relleno) |
| Primario tinte | `primary-tint` | `#1B2440` | Fondo del mensaje de usuario, fondo de selección |
| Secundario | `secondary` | `#22D3EE` | Acento puntual |
| Secundario tinte | `secondary-tint` | `#113039` | Fondo de chip secundario |
| Texto principal | `ink` | `#EEF1F8` | Cuerpo, títulos |
| Texto secundario | `muted` | `#93A0BF` | Metadatos, timestamps, labels |
| Texto terciario | `faint` | `#68749C` | Placeholder, deshabilitado |
| Fondo | `surface` | `#0B1220` | Fondo de la columna de chat |
| Fondo capa 2 | `surface-2` | `#121A2B` | Sidebar, header, chip |
| Fondo capa 3 | `surface-3` | `#1A2338` | Bloque dentro de una card |
| Borde | `line` | `#27314A` | Separadores, bordes de card |
| Borde fuerte | `line-strong` | `#38435F` | Borde con más contraste |
| Éxito | `signal-good` | `#3DDC84` | Sesión libre, turno completo |
| Alerta | `signal-warn` | `#F2B84B` | Cuota > 75%, esperando permiso |
| Error | `signal-bad` | `#FF6B6B` | Error de turno, sesión caída |

## Identidad

- **Tono:** técnico y directo, sin adorno. Una herramienta de trabajo, no un producto de consumo.
- **Diferenciador visual:** la ausencia de cromo — nada de burbujas ni avatares en la respuesta de Claude, ninguna tarjeta grande por cada tool. Lo que sí tiene peso visual es la actividad en vivo (shimmer en el texto que está "pensando" o corriendo una tool) y los materiales translúcidos de header/composer al hacer scroll.
- **Contraste verificado:** `primary` sobre `surface` da 4.6:1 en claro (`#3156FA` / `#FFFFFF`) y 7.1:1 en oscuro (`#7C9BFF` / `#0B1220`) — ambos pasan AA para texto normal. `ink`/`surface` da 15.8:1 en claro y 15.3:1 en oscuro.
- **NO usar:** Merriweather ni ninguna serif en el cuerpo de la respuesta; más de una familia tipográfica a la vez; degradé morado de IA genérica; burbuja de chat para los mensajes de Claude.
