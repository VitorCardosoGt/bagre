#!/usr/bin/env bash
# check-ports.sh — valida as portas do IPAM contra um host alvo.
# Sai com código 0 se todas abertas, ou o número de portas fechadas.
#
# Uso:
#   bash infra/check-ports.sh                 # default: 10.0.0.10 (VM SP3)
#   bash infra/check-ports.sh localhost       # validar localmente na VM
#   bash infra/check-ports.sh 192.168.1.100    # outro host

set -u

HOST="${1:-10.0.0.10}"
TIMEOUT=3

if [ -t 1 ]; then
  GREEN=$'\033[0;32m'
  RED=$'\033[0;31m'
  YELLOW=$'\033[1;33m'
  RESET=$'\033[0m'
else
  GREEN=""
  RED=""
  YELLOW=""
  RESET=""
fi

if ! command -v nc >/dev/null 2>&1; then
  echo "Erro: 'nc' (netcat) não está instalado." >&2
  echo "  Mac: já vem nativo." >&2
  echo "  Linux: sudo apt install -y netcat-openbsd" >&2
  exit 2
fi

PORTS=(
  "80:HTTP (reverse proxy / nginx em frente)"
  "3000:Web UI (frontend)"
  "3001:API REST + /metrics"
  "5433:PostgreSQL (porta no host)"
)

ok=0
fail=0

echo
echo "Verificando portas em ${YELLOW}${HOST}${RESET} (timeout ${TIMEOUT}s por porta)"
echo "------------------------------------------------------------"

for entry in "${PORTS[@]}"; do
  port="${entry%%:*}"
  desc="${entry#*:}"
  if nc -z -w "$TIMEOUT" "$HOST" "$port" 2>/dev/null; then
    printf "  ${GREEN}[OK]  ${RESET} %-5s  %s\n" "$port" "$desc"
    ok=$((ok + 1))
  else
    printf "  ${RED}[FAIL]${RESET} %-5s  %s\n" "$port" "$desc"
    fail=$((fail + 1))
  fi
done

echo "------------------------------------------------------------"
echo "Resultado: ${GREEN}${ok} aberta(s)${RESET}, ${RED}${fail} fechada(s)/timeout${RESET}"

exit "$fail"
