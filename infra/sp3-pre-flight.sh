#!/usr/bin/env bash
# sp3-pre-flight.sh — valida a VM do SP3 ANTES de rodar deploy.sh
# Não modifica nada. Só checa. Sai com código 0 se tudo OK, 1 se faltar algo crítico.
#
# Uso: bash infra/sp3-pre-flight.sh

set -uo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ ✓ ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ ! ]${NC} $*"; }
fail() { echo -e "${RED}[ ✗ ]${NC} $*"; exit_code=1; }
log()  { echo; echo -e "${BLUE}─── $* ───${NC}"; }

exit_code=0

log "Sistema operacional"
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  ok "$PRETTY_NAME"
else
  fail "/etc/os-release não encontrado — SO desconhecido"
fi

log "Usuário e permissões"
if [[ "$EUID" -eq 0 ]]; then
  warn "rodando como root — recomendado: usuário comum no grupo 'docker'"
else
  ok "rodando como '$USER' (não root)"
fi
if id -nG "$USER" 2>/dev/null | grep -qw docker; then
  ok "user '$USER' no grupo 'docker'"
else
  fail "user '$USER' FORA do grupo docker — execute: sudo usermod -aG docker $USER && exec su - $USER"
fi

log "Comandos essenciais"
for cmd in git curl docker openssl; do
  if command -v "$cmd" >/dev/null; then
    ok "$cmd: $(command -v $cmd)"
  else
    fail "$cmd FALTANDO — instale antes de prosseguir"
  fi
done

log "Docker daemon"
if docker info >/dev/null 2>&1; then
  ok "docker daemon rodando"
else
  fail "docker daemon NÃO rodando — execute: sudo systemctl start docker"
fi

log "Docker Compose plugin"
if docker compose version >/dev/null 2>&1; then
  ok "compose: $(docker compose version --short 2>/dev/null)"
else
  fail "docker compose plugin FALTANDO — instale via 'apt install docker-compose-plugin' ou similar"
fi

log "Espaço em disco"
disk_free_gb=$(df -BG /opt 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}')
disk_free_gb=${disk_free_gb:-0}
if [[ "$disk_free_gb" -ge 10 ]]; then
  ok "espaço livre em /opt: ${disk_free_gb}G (>= 10G recomendado)"
elif [[ "$disk_free_gb" -ge 5 ]]; then
  warn "espaço livre em /opt: ${disk_free_gb}G (< 10G — vai apertar)"
else
  fail "espaço livre em /opt: ${disk_free_gb}G (< 5G — INSUFICIENTE)"
fi

log "Memória RAM"
ram_total_gb=$(free -g 2>/dev/null | awk '/^Mem:/ {print $2}')
ram_total_gb=${ram_total_gb:-0}
if [[ "$ram_total_gb" -ge 4 ]]; then
  ok "RAM total: ${ram_total_gb}G"
elif [[ "$ram_total_gb" -ge 2 ]]; then
  warn "RAM total: ${ram_total_gb}G (recomendado 4G+)"
else
  fail "RAM total: ${ram_total_gb}G (INSUFICIENTE — mínimo 2G)"
fi

log "Sincronização de hora (NTP)"
if command -v timedatectl >/dev/null; then
  if timedatectl status 2>/dev/null | grep -qE "synchronized: yes|NTP synchronized: yes|System clock synchronized: yes"; then
    ok "NTP sincronizado"
  else
    warn "NTP NÃO sincronizado — pode causar drift em JWT/auditoria"
  fi
else
  warn "timedatectl não disponível — verifique NTP manualmente"
fi

log "Conectividade externa"
if curl -sf --max-time 5 https://registry-1.docker.io/v2/ -o /dev/null; then
  ok "registry-1.docker.io alcançável (Docker Hub)"
else
  fail "Docker Hub INALCANÇÁVEL — sem isso, não dá pra fazer pull"
fi
if curl -sf --max-time 5 https://github.com -o /dev/null; then
  ok "github.com alcançável"
else
  fail "GitHub INALCANÇÁVEL — sem isso, git clone falha"
fi

log "Portas necessárias"
for port in 3000 3001 5433; do
  if command -v lsof >/dev/null && lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    pid=$(lsof -Pi :$port -sTCP:LISTEN -t | head -1)
    proc=$(ps -p $pid -o comm= 2>/dev/null || echo "?")
    fail "porta $port EM USO (pid $pid: $proc)"
  elif command -v ss >/dev/null && ss -tln 2>/dev/null | grep -qE ":$port "; then
    fail "porta $port EM USO (ss detectou)"
  else
    ok "porta $port livre"
  fi
done

log "Resumo"
echo
if [[ "$exit_code" -eq 0 ]]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✓ TUDO PRONTO. Pode rodar: bash infra/deploy.sh${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}✗ FAILS encontrados. Resolva ANTES de rodar deploy.sh${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi
exit $exit_code
