## Lectura — Fase 12, pasos 1 y 2 (8-oct-2026)

**Resultado:** 214 pasan, 0 fallan y 2 bloqueados, en `:3901` (Claude real) y `:3902` (CLI falso), con build de `diseno/propio` en `/tmp/cloudcli-e2e/app`. Instancias aisladas en tres cosas: `cuota.json` por puerto, socket de tmux propio (`TMUX_TMPDIR`) y registro de sesiones propio (`AOS_SESIONES_REGISTRO_PATH`).

### Cómo se llegó al verde

La corrida conjunta (`todo --con-cuota`) dio 208 bien y 6 mal. Las 6 se arreglaron en la causa y se volvieron a correr solo esos escenarios, que reemplazan sus filas en este informe:

| Escenario | Qué fallaba | Causa | Arreglo |
|---|---|---|---|
| `a11y/chat` (4 checks, tema claro) | axe `color-contrast` en el `30%` del indicador de cuota | Producto: una lectura vieja apagaba el texto con `opacity-60` y bajaba el contraste de 4,5:1. No había aparecido antes porque la instancia mostraba "sin leer aún" | `UsageWindowIndicator`: lo viejo va con `text-ds-muted`, el gris del rótulo, que ya pasa axe. Test unitario: rojo sin el arreglo, verde con él. **Revalidado con el estado viejo a la vista:** `:3902` reiniciada limpia, solo una lectura de hace 20 min, y la API la siguió sirviendo al terminar la corrida (`leidoEn` sin cambios) |
| `barra/orquestador` (2 checks) | la fila de `orquestar.py crear` aparecía 1 de 5 veces; `dormir` no la sacaba | Arnés: con el registro aislado, `hibernar.py` seguía escribiendo `hibernadas.json` en `~/.cache/aos/`, y el vigía de la instancia escucha el directorio del registro | `hibernar.py` (workspace-leandro `25faf16c`): con `AOS_SESIONES_REGISTRO_PATH`, `hibernadas.json` va al lado del registro. Verde 5 de 5, y `dormir` saca la fila en 418 ms |

Efecto colateral del mismo hueco, ya resuelto: las corridas del arnés del 7 y 8 de octubre habían dejado 11 entradas `e2e-*` en el `hibernadas.json` real. Se sacaron (copia previa en el scratchpad de la sesión) y la revalidación no dejó ninguna nueva.

### Arreglos del día, en verde en esta corrida

- Mensaje con captura adjunta (`d27ef84c`): `tmux/adjunto`.
- Nombres humanos y estado de la barra (`851b86e1`, `7475c447`): `barra/nombres` y `barra/estado-vivo`.
- Borrador de tmux tras un AskUserQuestion (`762bdc80`, merge `2e2f5d60`): `pregunta/tmux-multi`.
- Cuadro de texto con más de 8 líneas (`b8041c9a`): no tiene escenario e2e. Lo cubren los unitarios con panes reales (`tmux-cuadro-panes-reales.test.ts`), dentro del verde de server.

### Unitarios

- Cliente: `NODE_ENV=test npx vitest run` → 810/810.
- Server: `NODE_ENV=test npm test` → 934 bien, 0 mal y 1 omitido (`6599520e`). Las 4 fallas que había eran de los tests:
  - `claude-cuenta-env` heredaba `AOS_CUENTA=personal`.
  - Los dos de `shell-tmux` apuntaban a un worktree ya borrado.
  - `claude-runtime-hold` dependía del reloj: fallaba en 3 de 8 corridas bajo carga, siempre del lado positivo.

### Bloqueados

`headless/pensamiento` (2 checks) necesita `CLAUDE_CODE_OAUTH_TOKEN` en `:3901`. La suite no maneja credenciales: decide Leandro. Ese check ya se había revalidado con token el 06-oct (`e2e/evidencia/revalida-fase-4/`).
