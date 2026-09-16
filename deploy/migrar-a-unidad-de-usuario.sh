#!/usr/bin/env bash
# Migra cloudcli de unidad de SISTEMA (/etc/systemd/system) a unidad de USUARIO
# (~/.config/systemd/user). Escrito el 16-sep-2026.
#
# POR QUE: la unidad de sistema necesitaba `sudo systemctl restart` para cada
# despliegue, y el agente no tiene sudo. Siete planes distintos tienen un check
# que dice "lo corre Leandro" solo por eso. El servicio no necesita root:
# User=leantejado, puerto 3001 > 1024, WorkingDirectory en el home.
#
# DONDE CORRERLO: en ttyd (:10000) o por SSH. NUNCA desde la terminal ni el chat
# de CloudCLI: los dos cuelgan del cgroup del servicio y el script se mata solo
# a mitad de camino. El guard de abajo lo verifica y frena.
#
# REVERSIBLE: la unidad de sistema queda en /etc, solo deshabilitada. Para
# volver atras:  systemctl --user disable --now cloudcli
#                sudo systemctl enable --now cloudcli
set -euo pipefail

UNIDAD_USUARIO="$HOME/.config/systemd/user/cloudcli.service"
HEALTH="http://100.77.186.53:3001/api/health"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }

# --- Guard: no correr desde adentro del servicio que vamos a matar ---
if grep -q 'cloudcli\.service' /proc/self/cgroup; then
  rojo "FRENO: este shell cuelga del cgroup de cloudcli.service."
  rojo "Pararlo mata este script a mitad de la migracion y el servicio queda caido."
  rojo "Corré esto desde ttyd (https://<tailnet>:10000) o por SSH."
  exit 1
fi

# --- Preflight ---
[[ -f "$UNIDAD_USUARIO" ]] || { rojo "Falta $UNIDAD_USUARIO"; exit 1; }
systemd-analyze --user verify "$UNIDAD_USUARIO"
verde "1/6 · unidad de usuario valida"

echo
echo "Esto corta las sesiones de CloudCLI abiertas en el navegador."
echo "Las sesiones de tmux (ct) NO se tocan: viven en su propio servidor."
read -r -p "¿Seguimos? [s/N] " r
[[ "$r" == "s" || "$r" == "S" ]] || { echo "Cancelado, nada cambio."; exit 0; }

# --- Corte ---
sudo systemctl disable --now cloudcli.service
verde "2/6 · unidad de sistema parada y deshabilitada"

for i in $(seq 1 30); do
  ss -ltn 2>/dev/null | grep -q ':3001 ' || break
  sleep 1
done
ss -ltn 2>/dev/null | grep -q ':3001 ' && { rojo "El puerto 3001 sigue ocupado tras 30s"; exit 1; }
verde "3/6 · puerto 3001 libre"

# --- Alta ---
systemctl --user daemon-reload
systemctl --user enable --now cloudcli.service
verde "4/6 · unidad de usuario habilitada y arrancada"

# --- Verificacion ---
for i in $(seq 1 60); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH" || true)" == "200" ]] && break
  sleep 2
done
codigo="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH" || true)"
[[ "$codigo" == "200" ]] || { rojo "/api/health devolvio $codigo. Logs: journalctl --user -u cloudcli -n 50"; exit 1; }
verde "5/6 · /api/health responde 200"

systemctl --user show cloudcli -p Environment | grep -q 'CLAUDE_CODE_AUTO_COMPACT_WINDOW=278000' \
  || { rojo "Falta CLAUDE_CODE_AUTO_COMPACT_WINDOW en el entorno del servicio"; exit 1; }
verde "6/6 · CLAUDE_CODE_AUTO_COMPACT_WINDOW=278000 presente"

echo
verde "Migracion completa."
echo "Desde ahora, sin sudo:"
echo "  systemctl --user restart cloudcli"
echo "  journalctl --user -u cloudcli -n 50 --no-pager"
