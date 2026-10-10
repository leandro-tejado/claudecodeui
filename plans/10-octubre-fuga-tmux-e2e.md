# Fuga de sesiones tmux en el arnés e2e

**Estado:** borrador
**Creado:** 10-oct-2026, pedido de Leandro (RAM del VPS casi llena)

## Contexto

El 9-oct quedó vivo ~8 h un servidor de tmux de prueba (socket `/tmp/cloudcli-e2e/tmux/tmux-1001/default`) con 8 sesiones `cloudcli-proyecto-*` corriendo `claude` en `~/.cache/cloudcli-e2e/proyecto`: 24 procesos, ~1,9 GB. Se mató a mano el 10-oct (se liberaron ~1,4 GB). Las crea el server de la instancia de prueba (`nombreTmux`) con cada `chat.send-tmux`, y `instancia.mjs down` no cierra el servidor de tmux de su `TMUX_TMPDIR`.

Quedan además 32 sockets muertos en `/tmp/tmux-1001/` (`cloudcli-prueba-panes-*`, `cloudcli-prueba-titulo-*`, `adjuntos-prueba`, `cuadro-prueba`), de tests unitarios que no limpian su socket. El `rm` estaba denegado para el agente.

## Pedido

1. Cada escenario cierra las sesiones de tmux que creó aunque falle (`try/finally`).
2. `e2e/correr.mjs` hace `kill-server` de SU socket (`TMUX_TMPDIR` de la instancia) al terminar y al recibir SIGINT/SIGTERM. `instancia.mjs down` también.
3. Al arrancar una corrida, matar servidores de e2e viejos: socket bajo `/tmp/cloudcli-e2e` con más de 2 h.
4. Los tests unitarios que crean `cloudcli-prueba-*`, `adjuntos-prueba` y `cuadro-prueba` borran su socket al terminar.
5. Test que lo pruebe: tras una corrida corta (`:3902`, CLI falso, sin cuota) no queda ningún proceso con cwd `~/.cache/cloudcli-e2e/proyecto` ni servidor de tmux bajo `/tmp/cloudcli-e2e`.
6. Commit en `diseno/propio` (tipo `fix`/`test`) y push.

## Restricciones

- **NUNCA** el servidor de tmux por defecto (`/tmp/tmux-1001/default`): ahí viven las sesiones reales de Leandro. Todo `kill-server` va con `-S <socket de prueba>` explícito.
- No reiniciar `:3001`. No leer `.env`. Tests con `NODE_ENV=test`.
- Instancias aisladas (3901/3902, `TMUX_TMPDIR` propio), nunca el socket por defecto.

#### Estado (arranca todo en fail)
- [fail] Tras una corrida corta no queda ningún `claude` de e2e | valida: `for p in $(pgrep -f claude); do readlink /proc/$p/cwd; done | grep -c cloudcli-e2e/proyecto` da 0
- [fail] No queda servidor de tmux bajo `/tmp/cloudcli-e2e` tras `correr.mjs` ni tras Ctrl+C | valida: `pgrep -af "tmux.*cloudcli-e2e"` vacío
- [fail] Server y cliente en verde | valida: `NODE_ENV=test npm test` y `NODE_ENV=test npx vitest run`
- [fail] Commit y push en `diseno/propio` | valida: `git status -sb` sin adelanto
