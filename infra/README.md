# `infra/` — Deploy & operação do Bagre

Scripts versionados pra subir e manter o IPAM em uma VM Linux **já provisionada** (com SO + Docker), tipicamente uma VM no .

> **Por que sem Terraform?** A VM é entregue pronta por outro time — terraformar a VM em si seria overkill. Esses scripts cobrem **deploy + operação** (camada acima da VM), versionados em git pra reproduzibilidade e rastreabilidade. É IaC sem precisar de Terraform.

---

## Pré-requisitos na VM

| Item | Como verificar |
|---|---|
| Linux (Ubuntu 22.04+, RHEL 9+, ou similar) | `cat /etc/os-release` |
| Docker Engine | `docker --version` |
| Docker Compose plugin | `docker compose version` |
| `git`, `curl` | `which git curl` |
| Usuário com permissão de docker (no grupo `docker`) | `groups` deve listar `docker` |

Se faltar Docker: <https://docs.docker.com/engine/install/>

---

## Primeiro deploy (do zero)

```bash
# 1. Pega só o script de deploy (ele clona o resto)
curl -fsSL https://raw.githubusercontent.com/fabricio-cruz/bagre/main/infra/deploy.sh -o /tmp/deploy.sh

# 2. Roda
bash /tmp/deploy.sh
```

O script vai:

1. Validar pré-requisitos (git, docker, etc).
2. Clonar o repo em `/opt/bagre` (default).
3. Criar `.env` a partir de `.env.example`.
4. **PARAR** com instrução pra você editar o `.env` (não roda com defaults inseguros).

Edite `/opt/bagre/.env` substituindo:

| Variável | Como gerar / preencher |
|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `BOOTSTRAP_ADMIN_EMAIL` | Email do admin inicial |
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha forte (mín. 12 chars) |
| `INGEST_TOKEN` | Token aleatório (só se for usar `/api/ingest/*`) |
| `ADMIN_TOKEN` | Token aleatório (só se for usar `/api/import/seed`) |

Depois, rode de novo:

```bash
bash /opt/bagre/infra/deploy.sh
```

Saída esperada (final):

```text
─────────────────────────────────────────────────────
🚀  Bagre no ar
─────────────────────────────────────────────────────
  Web        → http://10.x.x.x:3000
  API        → http://10.x.x.x:3001
  Health     → http://10.x.x.x:3001/api/health
  Métricas   → http://10.x.x.x:3001/metrics
  Branch     → main (abc1234)
  Caminho    → /opt/bagre
─────────────────────────────────────────────────────
```

---

## Re-deploy (atualizações)

**Idempotente** — pode rodar quantas vezes precisar:

```bash
bash /opt/bagre/infra/deploy.sh
```

Pra deploy de outra branch (ex.: feature):

```bash
bash /opt/bagre/infra/deploy.sh --branch feature/xyz
```

---

## Backup automático (recomendado)

O `backup.sh` gera um dump do Postgres compactado por dia, retém últimos 14 dias.

### Configuração inicial

```bash
# 1. Garante permissão pra criar o diretório de backup
sudo mkdir -p /var/backups/bagre
sudo chown $USER:$USER /var/backups/bagre

# 2. Testa rodando manualmente
bash /opt/bagre/infra/backup.sh
```

### Agendar via cron

```bash
crontab -e
```

Adicione (rodar todo dia às 02:00):

```cron
0 2 * * * bash /opt/bagre/infra/backup.sh >> /var/log/bagre-backup.log 2>&1
```

Verifica logs depois:

```bash
tail -f /var/log/bagre-backup.log
```

---

## Restore (caso precise)

```bash
cd /opt/bagre
gunzip -c /var/backups/bagre/ipam-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose exec -T db psql -U bagre -d bagre
```

> ⚠️ Restore sobrescreve o banco atual. Pra um restore limpo, derrube o stack antes (`docker compose down`), apague o volume do db (`docker volume rm bagre_db-data`), suba só o db (`docker compose up -d db`), espere ele ficar saudável, e aí faça o restore.

---

## Comandos úteis no dia-a-dia

```bash
# logs em tempo real
docker compose -f /opt/bagre/docker-compose.yml logs -f api

# status dos containers
cd /opt/bagre && docker compose ps

# parar tudo
cd /opt/bagre && docker compose down

# parar e remover volumes (CUIDADO — apaga banco)
cd /opt/bagre && docker compose down -v
```

---

## Próximos passos sugeridos (não cobertos por este deploy básico)

| Item | Quando atacar |
|---|---|
| **Reverse proxy (nginx) com TLS** | Antes de expor além da rede interna |
| **Firewall**: liberar só portas necessárias | Antes do beta |
| **Monitoramento via Zabbix** (a integração já existe no IPAM) | Fase de operação |
| **DNS interno apontando pra VM** | Pra não decorar IP |
| **CI/CD** (Azure DevOps) — re-deploy automático ao push em `main` | Quando o ritmo de mudança aumentar |

---

## Estrutura

```text
infra/
├── deploy.sh    ← deploy idempotente (clone/pull + build + up + healthcheck)
├── backup.sh    ← dump diário do Postgres com retenção
└── README.md    ← este arquivo
```
