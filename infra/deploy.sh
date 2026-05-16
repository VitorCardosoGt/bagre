#!/usr/bin/env bash
# deploy.sh — provisiona/atualiza Bagre em uma VM Linux com Docker.
# Idempotente — pode rodar várias vezes seguidas. Pensado pra rodar no
#  em uma VM já pronta (Ubuntu/RHEL + Docker + Compose).
#
# Uso:
#   bash infra/deploy.sh                       # primeira vez ou re-deploy de main
#   bash infra/deploy.sh --branch feature/xyz  # deploy de outra branch
#   bash infra/deploy.sh --dir /opt/ipam       # outro diretório alvo
#
# Variáveis de ambiente aceitas (override de defaults):
#   REPO_URL, DEPLOY_DIR, BRANCH, HEALTH_TIMEOUT

set -euo pipefail

# ---------- Defaults ----------
REPO_URL="${REPO_URL:-https://github.com/fabricio-cruz/bagre.git}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/bagre}"
BRANCH="${BRANCH:-main}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
HEALTH_URL="http://localhost:3001/api/health"
WEB_URL="http://localhost:3000/"

# ---------- Cores pra logs ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ✓ ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ ! ]${NC} $*"; }
fail() { echo -e "${RED}[ ✗ ]${NC} $*" >&2; exit 1; }

# ---------- Args ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --dir)    DEPLOY_DIR="$2"; shift 2 ;;
    --repo)   REPO_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
    *) fail "argumento desconhecido: $1" ;;
  esac
done

# ---------- Pré-flight ----------
log "verificando pré-requisitos…"
command -v git    >/dev/null || fail "git não instalado. Use: sudo apt install git"
command -v curl   >/dev/null || fail "curl não instalado. Use: sudo apt install curl"
command -v docker >/dev/null || fail "docker não instalado. https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1   || fail "docker daemon não rodando. sudo systemctl start docker"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin não instalado"
[[ "$EUID" -ne 0 ]] || warn "rodando como root — recomendado: usuário no grupo 'docker'"
ok "pré-requisitos OK"

# ---------- Clone ou pull ----------
if [[ -d "$DEPLOY_DIR/.git" ]]; then
  log "repo já existe em $DEPLOY_DIR — atualizando branch $BRANCH …"
  cd "$DEPLOY_DIR"
  git fetch --all --prune
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  log "clonando $REPO_URL → $DEPLOY_DIR (branch: $BRANCH) …"
  if [[ ! -w "$(dirname "$DEPLOY_DIR")" ]]; then
    sudo mkdir -p "$DEPLOY_DIR"
    sudo chown "$USER:$USER" "$DEPLOY_DIR"
  else
    mkdir -p "$DEPLOY_DIR"
  fi
  git clone --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi
ok "código atualizado (HEAD: $(git rev-parse --short HEAD))"

# ---------- .env ----------
if [[ ! -f .env ]]; then
  log "criando .env a partir de .env.example…"
  cp .env.example .env
  echo
  warn "─────────────────────────────────────────────────────"
  warn "  .env recém-criado com defaults inseguros."
  warn "  EDITE antes de continuar:"
  warn "    sudo nano $DEPLOY_DIR/.env"
  warn ""
  warn "  Substitua estes valores:"
  warn "    JWT_SECRET             — gere: openssl rand -base64 48"
  warn "    BOOTSTRAP_ADMIN_EMAIL  — email do admin inicial"
  warn "    BOOTSTRAP_ADMIN_PASSWORD — senha forte (mín. 12 chars)"
  warn "    INGEST_TOKEN           — só se for usar /api/ingest/*"
  warn "    ADMIN_TOKEN            — só se for usar /api/import/seed"
  warn "─────────────────────────────────────────────────────"
  fail "depois de editar, rode novamente: bash infra/deploy.sh"
fi

# Validação: rejeita defaults inseguros
if grep -qE "^(JWT_SECRET=please-change|BOOTSTRAP_ADMIN_PASSWORD=admin123|ADMIN_TOKEN=change-me|INGEST_TOKEN=change-me-ingest)" .env; then
  fail ".env ainda tem valores default ('change-me' / 'please-change' / 'admin123'). Substitua."
fi
ok ".env validado"

# ---------- Build + up ----------
log "buildando imagens…"
docker compose build
ok "build OK"

log "subindo stack…"
docker compose up -d
ok "stack iniciada"

# ---------- Health check ----------
log "aguardando API ficar saudável (max ${HEALTH_TIMEOUT}s)…"
healthy=false
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf -o /dev/null --max-time 2 "$HEALTH_URL"; then
    ok "API saudável em ${i}s"
    healthy=true
    break
  fi
  sleep 1
done
[[ "$healthy" == "true" ]] || fail "API não respondeu 200 em ${HEALTH_TIMEOUT}s. Logs: docker compose logs api"

# ---------- Smoke test ----------
log "smoke test…"
WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$WEB_URL" || echo "ERR")
if [[ "$WEB_CODE" == "200" ]]; then
  ok "Web → HTTP 200"
else
  warn "Web → HTTP $WEB_CODE (esperado 200) — confira docker compose logs web"
fi

CONT_UP=$(docker compose ps --status running --format json 2>/dev/null | grep -c '"Service"' || echo "?")
ok "$CONT_UP containers rodando"

# ---------- Resumo ----------
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<ip-da-vm>")
echo
echo "─────────────────────────────────────────────────────"
echo "🚀  Bagre no ar"
echo "─────────────────────────────────────────────────────"
echo "  Web        → http://$IP:3000"
echo "  API        → http://$IP:3001"
echo "  Health     → http://$IP:3001/api/health"
echo "  Métricas   → http://$IP:3001/metrics"
echo "  Branch     → $BRANCH ($(git rev-parse --short HEAD))"
echo "  Caminho    → $DEPLOY_DIR"
echo "─────────────────────────────────────────────────────"
echo
log "logs:        docker compose -f $DEPLOY_DIR/docker-compose.yml logs -f"
log "parar:       cd $DEPLOY_DIR && docker compose down"
log "re-deploy:   bash $DEPLOY_DIR/infra/deploy.sh"
