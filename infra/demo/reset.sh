#!/usr/bin/env bash
# Reset diário do ambiente de demonstração (demo.bagre.dev).
#
# Idempotente e convergente: derruba o api, zera o schema do Postgres do Bagre,
# repovoa o Zabbix e sobe o api de novo — que no boot reconstrói o schema
# (prisma db push), reimporta o seed base e roda o demo-seed (usuários demo +
# fixação do Zabbix + sync inicial).
#
# Uso (cron, 04h BRT):
#   0 4 * * *  CRON_TZ=America/Sao_Paulo  flock -n /tmp/bagre-reset.lock /opt/bagre/infra/demo/reset.sh >> /var/log/bagre-demo-reset.log 2>&1
#
# O `start api` é garantido por trap mesmo se um passo intermediário falhar:
# o demo nunca fica derrubado por um erro de reset.

set -uo pipefail

# Raiz do repo = dois níveis acima deste script (infra/demo/reset.sh).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose
  -f docker-compose.yml
  -f docker-compose.zabbix-dev.yml
  -f docker-compose.demo.yml)

DB_USER="${BAGRE_DB_USER:-bagre}"
DB_NAME="${BAGRE_DB_NAME:-bagre}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Garante que o api volte a subir aconteça o que acontecer.
start_api() {
  log "subindo api…"
  "${COMPOSE[@]}" up -d api
}
trap start_api EXIT

log "=== reset do demo iniciado ==="

log "parando api (para liberar o banco)…"
"${COMPOSE[@]}" stop api || log "aviso: stop api falhou (seguindo)"

log "zerando schema do Postgres do Bagre…"
"${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$DB_NAME" \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' \
  || log "aviso: drop schema falhou (seguindo)"

log "repovoando hosts no Zabbix (one-shot, idempotente)…"
"${COMPOSE[@]}" up -d --force-recreate zabbix-seed \
  || log "aviso: zabbix-seed falhou (o scheduler recupera)"

# O start do api acontece no trap EXIT.
log "=== reset concluído (api sobe no trap) ==="
