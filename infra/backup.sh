#!/usr/bin/env bash
# backup.sh — backup do Postgres do Bagre
# Pensado pra rodar via cron diário. Mantém últimos N dias.
#
# Uso manual:    bash infra/backup.sh
# Cron sugerido: 0 2 * * * bash /opt/bagre/infra/backup.sh >> /var/log/bagre-backup.log 2>&1
#
# Variáveis (override de defaults):
#   DEPLOY_DIR, BACKUP_DIR, RETENTION_DAYS

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/bagre}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/bagre}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

DB_USER="bagre"
DB_NAME="bagre"

# Cria pasta de backup se necessário (precisa permissão — rode como root no cron)
mkdir -p "$BACKUP_DIR"

cd "$DEPLOY_DIR"

# Verifica se o container do banco está rodando
if ! docker compose ps db --status running --format json 2>/dev/null | grep -q '"Service"'; then
  echo "[backup] ✗ container 'db' não está rodando — abortando" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/ipam-$TS.sql.gz"

echo "[backup] gerando dump em $OUT …"
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[backup] ✓ dump pronto ($SIZE)"

# Retenção: apaga arquivos mais velhos que N dias
DELETED=$(find "$BACKUP_DIR" -name "ipam-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete -print | wc -l | tr -d ' ')
[[ "$DELETED" -gt 0 ]] && echo "[backup] limpou $DELETED arquivo(s) com >$RETENTION_DAYS dias"

# Lista o que sobrou
echo "[backup] backups atuais em $BACKUP_DIR:"
ls -1tr "$BACKUP_DIR"/ipam-*.sql.gz 2>/dev/null | tail -10
