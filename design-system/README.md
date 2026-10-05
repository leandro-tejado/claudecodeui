---
updated: 2026-10-05
proyecto: CloudCLI
stack: React + Tailwind (cliente), TypeScript/Node (server)
---
# Design System — CloudCLI

**Audiencia:** Leandro, de celular y de escritorio, mirando sesiones de Claude Code (headless y de tmux) correr en el VPS. Minutos de uso entre chequeo y chequeo, no sesiones largas de lectura.

**Vibe:** calmo, técnico, directo.

**Dirección:** la base es el chat `/claude` de Optimum (`app-optimum-mkt`, `ChatClaude.tsx` + `MensajeMarkdown.tsx`) — ya la hicimos nosotros y es la referencia que Leandro sigue viendo rota acá: una sola sans, un acento, grises, Claude sin burbuja ni avatar, columna de lectura angosta (`max-w-3xl`). Encima de esa base se suma el lenguaje de materiales y movimiento de Apple (`apple-design`): translúcidos en header/composer, springs críticamente amortiguados (`damping 1.0`) para todo lo que no lleva gesto, tracking tipográfico por tamaño, y respeto estricto de `prefers-reduced-motion`/`prefers-reduced-transparency`. Apple suma comportamiento, no reemplaza la base — nada de glassmorphism decorativo ni gradientes de color que Optimum no tiene.

**Afuera, explícito:** Merriweather y cualquier mezcla de familias tipográficas (hoy CloudCLI mezcla Merriweather serif en las respuestas con Encode Sans en la UI — ver línea base, punto 1 y punto 8 de `e2e/evidencia/00-linea-base/lectura.md`); burbujas y avatar en los mensajes de Claude; tarjetas grandes por cada tool (la actividad va en una línea, plegable); degradés morados o cualquier paleta genérica de IA.

## De dónde sale cada decisión

| Decisión | Por qué | Fuente |
|---|---|---|
| Sans única, sin serif | Punto 1 y 8 de la línea base: la mezcla Merriweather/Encode Sans es parte de por qué CloudCLI no se siente como Optimum | `e2e/evidencia/00-linea-base/lectura.md`, capturas `diseno-capturas/*-final.png` |
| Claude sin burbuja, usuario con tinte | Así está en `ChatClaude.tsx:1483-1499` (Optimum) | `app-optimum-mkt/src/components/features/claude/ChatClaude.tsx` |
| Columna `max-w-3xl` centrada | Mismo archivo, comentario "LA COLUMNA CENTRADA (23-sep)" | ídem, línea ~1460 |
| Markdown sin títulos gigantes, cita con barra de acento | `MensajeMarkdown.tsx` | `app-optimum-mkt/src/components/features/analisis/MensajeMarkdown.tsx` |
| Materiales translúcidos en header/composer, springs `damping 1.0` | Regla 13 de `global-rules.md` + skill `apple-design` | `~/.claude/skills/apple-design/SKILL.md` |
| Paleta de marca (`primary`/`secondary`/`signal`) | Tokens reales de Optimum, no inventados | `app-optimum-mkt/tailwind.config.ts` |

## Qué falta (bloqueado en esta corrida)

- El boceto del cuestionario (`05-octubre-cuestionario.html`) espera el prompt de ejemplo de Leandro (paso 1 del plan, bloqueante). No se dibuja en esta corrida.
- La captura en vivo del chat de Optimum (paso 3) no se hizo: levantarlo pide credenciales de Supabase, fuera de alcance de este agente. El diseño sale del código fuente, leído directo (ver tabla de arriba).
- La aprobación de Leandro por `AskUserQuestion` (paso 9) la pide el orquestador, no esta corrida.
