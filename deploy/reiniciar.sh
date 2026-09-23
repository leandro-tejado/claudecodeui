#!/usr/bin/env bash
# Reinicia cloudcli chequeando primero si dist/ o dist-server/ quedaron
# desactualizados contra el código fuente, y reconstruye antes de reiniciar
# si hace falta. Reemplaza al `systemctl --user restart cloudcli` crudo como
# comando canónico de despliegue.
#
# POR QUÉ: el 17-sep-2026 tres fases enteras quedaron mergeadas, pusheadas y
# con el servicio "reiniciado exitosamente" — pero invisibles, porque nadie
# corrió `npm run build` antes del restart. El `dist/` tenía 16 horas de
# atraso contra el último commit de `src/`. Este script automatiza el chequeo
# para que no dependa de acordarse. Plan: 17-septiembre-cloudcli-build-automatico.md
#
# USO:
#   deploy/reiniciar.sh                 chequea staleness, reconstruye si hace falta, reinicia
#   deploy/reiniciar.sh --sin-build     saltea el chequeo y el build, reinicia directo
#   deploy/reiniciar.sh --forzar-build  reconstruye siempre, aunque dist/ esté al día
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

SIN_BUILD=0
FORZAR_BUILD=0
for arg in "$@"; do
    case "$arg" in
        --sin-build) SIN_BUILD=1 ;;
        --forzar-build) FORZAR_BUILD=1 ;;
        *) echo "reiniciar.sh: flag desconocida '$arg' (uso: --sin-build | --forzar-build)" >&2; exit 1 ;;
    esac
done
if [ "$SIN_BUILD" -eq 1 ] && [ "$FORZAR_BUILD" -eq 1 ]; then
    echo "reiniciar.sh: --sin-build y --forzar-build son mutuamente excluyentes" >&2
    exit 1
fi

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
ama()   { printf '\033[33m%s\033[0m\n' "$*"; }

# --- 1. Chequeo de staleness ---------------------------------------------
# dist/ (frontend) queda atrás de src/ o shared/; dist-server/ (backend)
# queda atrás de server/ o shared/. Cualquiera de los dos alcanza para
# considerar el build desactualizado.
stale=0
if [ "$FORZAR_BUILD" -eq 1 ]; then
    stale=1
elif [ "$SIN_BUILD" -eq 0 ]; then
    if [ ! -f dist/index.html ] || [ ! -f dist-server/server/index.js ]; then
        stale=1
    else
        stale_client="$(find src shared -newer dist/index.html -type f 2>/dev/null)"
        stale_server="$(find server shared -newer dist-server/server/index.js -type f 2>/dev/null)"
        if [ -n "$stale_client" ] || [ -n "$stale_server" ]; then
            stale=1
        fi
    fi
fi

# --- 2. Build condicional --------------------------------------------------
if [ "$SIN_BUILD" -eq 1 ]; then
    ama "sin cambios, reinicio directo (--sin-build: chequeo salteado)"
elif [ "$stale" -eq 1 ]; then
    ama "reconstruyendo antes de reiniciar"
    if ! npm run build; then
        rojo "build falló, servicio NO tocado"
        exit 1
    fi
else
    verde "sin cambios, reinicio directo"
fi

# --- 3. Vars de sesión de usuario para systemctl --user --------------------
# Sin esto, `systemctl --user` falla con "Failed to connect to bus" cuando
# el script corre fuera de una sesión de login interactiva (cron, ssh -t
# sin login shell, etc). Gotcha documentado el 17-sep-2026.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

# --- 4. Restart + verificación ----------------------------------------------
systemctl --user restart cloudcli
sleep 2

if systemctl --user is-active --quiet cloudcli; then
    verde "cloudcli activo"
    exit 0
else
    rojo "cloudcli NO quedó activo tras el restart"
    exit 1
fi
