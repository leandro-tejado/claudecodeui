## Lectura — Fase 12, paso 4: pasada contra `:3001` (9-oct-2026, 14:43–14:53)

Corrida por Leandro desde ttyd, con el login solo en el entorno de esa corrida. Build `c215ade5`, reiniciado el 8-oct a las 22:36.

**Resultado:** 60 bien, 8 mal y 26 bloqueados. Los bloqueados son los escenarios del CLI falso: hablan con guiones que el Claude real de `:3001` no tiene, y ya están en verde en `:3902` (`final-3901`).

**Limpieza, verificada al terminar:** 0 sesiones `e2e-*` vivas en el socket por defecto, 0 JWT en esta carpeta, 0 entradas `e2e-*` en `~/.cache/aos/hibernadas.json`, ningún archivo de token del 3001 en `/tmp/cloudcli-e2e`. La cuota semanal de optimum siguió en 82 %.

### Las 8 fallas

| Escenario | Qué pasó | De quién es |
|---|---|---|
| `barra/orquestador`, `cuota/header` y `visual/salidas` (3) | No encuentran `e2e-proyecto` en la barra. En `:3001` la carpeta del proyecto ya estaba dada de alta con el nombre `proyecto` (39 sesiones de corridas viejas); `create-project` dio 409 y no le puso el nombre | **Arnés**. Arreglado: con 409 lo renombra. Falta volver a correrlo |
| `headless/pensamiento` (1) | Buscaba el pid de la instancia de prueba (`/tmp/cloudcli-e2e/pid-3901`) | **Arnés**. Arreglado: contra `:3001` usa el `MainPID` del servicio. Falta volver a correrlo |
| `barra/estado-vivo` (1) | Después de `orquestar.py dormir`, la fila sigue diciendo "libre" a los 25 s. En `:3901` pasó a "dormida" en 3,2 s | **Abierto**. `dormir` escribe `hibernadas.json` en `~/.cache/aos/`, el directorio que vigila `:3001`. Hay que ver por qué no cambia el estado |
| `tmux/adjunto`, con dos imágenes (2) | Con una imagen pasa entera. Con dos, Claude contesta, pero el mensaje del usuario no aparece ni en el DOM ni en el JSONL | **Abierto**. En `:3901` pasó 8/8 |
| `tmux/recarga` (1) | El ack dice que está procesando, pero tras recargar no sigue el indicador | **Abierto**. En `:3901` pasó |

**Ruido del entorno real, no de CloudCLI:** en `:3001` están activos los hooks de Leandro. El de cuota metió la línea "Cuota: 7d en 82 %…" dentro de una respuesta de prueba (`barra-estado-vivo/despues-dormir.png`).

### Para la próxima pasada

Correr solo los 7 escenarios en rojo, con el arnés ya arreglado:

```
cd ~/cloudcli && read -rp 'usuario: ' U && read -rsp 'contraseña: ' P && echo && CLOUDCLI_USER="$U" CLOUDCLI_PASS="$P" CLOUDCLI_URL=http://127.0.0.1:3001 node e2e/correr.mjs barra/orquestador barra/estado-vivo cuota/header visual/salidas headless/pensamiento tmux/adjunto tmux/recarga --con-cuota --corrida final-3001; unset U P
```

### Repetición de los 7 en rojo (9-oct, 15:39)

Con el arnés arreglado: **71 bien, 4 mal y 26 bloqueados.** Pasan ahora `barra/orquestador`, `cuota/header`, `visual/salidas`, `headless/pensamiento` (en `:3001` el servicio sí tiene token) y `tmux/adjunto` 8/8: lo de las dos imágenes fue intermitente.

Siguen en rojo, y fallan en las dos corridas:
- `barra/estado-vivo`: esta vez ni siquiera encuentra el rótulo con el pane vivo (`rotuloConVida: null`), y no pasa a "dormida".
- `tmux/recarga`: el ack de suscripción ahora dice `isProcessing: false` con `runsInTmux: true`, y tras recargar no vuelve el indicador.

Los dos pasan en `:3901`. Lo que cambia en `:3001` es el registro de sesiones real, el socket por defecto y los hooks de Leandro. Hay que diagnosticarlos en una sesión nueva.

Limpieza: 0 `e2e-*` vivas, 0 JWT en la carpeta.

### Las dos últimas en rojo (9-oct, 16:20 y 16:53)

**Resultado final en `:3001`: 75 bien, 0 mal y 26 bloqueados** (los del CLI falso, en verde en `:3902`).

| Escenario | Causa | Arreglo |
|---|---|---|
| `barra/estado-vivo` | Arnés: el registro real tenía una entrada `e2e-estado-ejecutora-1` de una corrida vieja; `esperarSid` devolvía ese `session_id` y se abría otra sesión | Solo vale la entrada con la misma `creada` que la sesión de tmux (`c69a4a07`). El cierre saca las `e2e-*` muertas de `sesiones.json` |
| `tmux/recarga`, ack | Arnés: el párrafo terminaba en 7 s y la recarga con `networkidle` tardaba ~30 s | Turno largo y recarga apenas aparece el Stop (`c69a4a07`) |
| `tmux/recarga`, indicador | Arnés: con la UI en español el botón dice "Detener" y el check buscaba "Stop" | Se busca por el atajo `esc` (`f2c8bef9`) |
| (encontrado en el camino) | **Producto:** el sondeo de `/running-sessions` sacaba a los 10 s el indicador de un turno de tmux vivo; volvía con el reloj en cero | La gracia cuenta desde la última señal (`fd54e6b8`). Sonda en `:3901`: Stop fijo de +0,75 s al `complete`. Publicado en `:3001` con `npm run build` (bundle `index-B1RBkCzO.js`) |

**Archivado del proyecto:** no quedaba. El server desarchiva un proyecto cuando su transcript se escribe después de archivarlo, y el `claude` de un pane recién cerrado todavía escribe al morir. El cierre ahora espera a que no quede `claude`, archiva y lo comprueba (`1e85c167`, probado contra `:3901`). En `:3001` falta correr `--solo-cierre`.

Limpieza tras la corrida: 0 `e2e-*` vivas, 0 entradas `e2e-*` en `sesiones.json` ni en `hibernadas.json`, 0 JWT en la carpeta.
