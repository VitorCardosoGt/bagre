# Operação

> Backup, restore, troubleshooting, atualização, logs.
> **Autor**: Fabricio Cruz

---

## Logs

### API
```bash
docker compose logs -f api
docker compose logs --tail 50 api
docker compose logs --since 30m api | grep -i error
```

A API usa **Pino** (logger estruturado JSON). Para visualizar bonito:

```bash
docker compose logs --tail 100 api | docker run -i --rm node:20-alpine npx pino-pretty
```

### Banco
```bash
docker compose logs db --tail 30
```

### Frontend (nginx)
```bash
docker compose logs web --tail 50
# 200 OK e 404 pra rotas SPA são normais (fallback pro index.html)
```

---

## Backup do banco

### Backup manual

```bash
# Dump SQL completo
docker compose exec db pg_dump -U bagre -d bagre > backup-$(date +%Y%m%d-%H%M%S).sql

# Compactado
docker compose exec db pg_dump -U bagre -d bagre | gzip > backup.sql.gz
```

### Restore

```bash
# Atenção: APAGA dados existentes
docker compose exec -T db psql -U bagre -d bagre < backup.sql

# De um .gz
gunzip -c backup.sql.gz | docker compose exec -T db psql -U bagre -d bagre
```

### Backup automático (cron)

Crie um cron no host:

```bash
# crontab -e
0 2 * * * cd /Users/fabricio/Documents/code/bagre && docker compose exec -T db pg_dump -U bagre bagre | gzip > backups/$(date +\%Y\%m\%d).sql.gz
```

Recomendado: enviar para S3/Azure Blob a cada backup, manter retenção de 30 dias.

### Backup só do schema (sem dados)

Útil para versionar:

```bash
docker compose exec db pg_dump -U bagre -d bagre --schema-only > schema.sql
```

---

## Atualização do sistema

### Pull de nova versão

```bash
git pull   # ou método equivalente para baixar código novo

# Rebuild com cache (rápido)
docker compose up -d --build api web

# Migrações Prisma rodam automaticamente no boot da API
docker compose logs api --tail 30
```

### Mudanças destrutivas no schema

Se uma atualização inclui DROP TABLE ou rename:

1. **Backup antes**: `pg_dump | gzip > pre-upgrade.sql.gz`
2. Rebuild com `--accept-data-loss` se necessário (Prisma db push):
   ```bash
   docker compose exec api npx prisma db push --accept-data-loss
   ```
3. Verifique se o sistema sobe limpo: `curl http://localhost:3001/api/health`
4. Rollback: pare o sistema, restaure o backup, faça checkout da versão anterior

---

## Monitoramento contínuo

### Healthcheck simples

```bash
# Em qualquer ferramenta (Pingdom, UptimeRobot, etc)
curl -fs http://localhost:3001/api/health || alert
```

### Métricas Prometheus

`/metrics` é o caminho oficial. Veja [Integrações](./05-integracoes.md#métricas-prometheus) para scrape config e dashboards Grafana sugeridos.

### Auditoria contínua

Tela `/admin/audit` mostra os últimos 200 eventos por filtro. Para análise mais profunda:

```bash
# Top 10 usuários mais ativos no último mês
docker compose exec db psql -U bagre -c "
  SELECT actor, count(*) as ops
  FROM \"AuditLog\"
  WHERE \"createdAt\" > NOW() - INTERVAL '30 days'
  GROUP BY actor
  ORDER BY ops DESC LIMIT 10;
"

# Operações destrutivas recentes
docker compose exec db psql -U bagre -c "
  SELECT \"createdAt\", actor, entity, \"entityId\"
  FROM \"AuditLog\"
  WHERE action = 'delete'
  ORDER BY id DESC LIMIT 50;
"
```

---

## Troubleshooting

### Sistema não responde

```bash
docker compose ps
# Algum contêiner está com Restarting? Confira o motivo:
docker compose logs api --tail 100
```

Causas comuns:
- DB não saudável → `docker compose logs db`
- Porta ocupada no host → `lsof -i :3001`
- Sem memória → `docker stats`

### Login retorna 401 com credenciais corretas

```bash
# Verifica usuário ativo
docker compose exec db psql -U bagre -t -c "
  SELECT email, role, active, \"mustChangePwd\" FROM \"User\";
"
```

Reset (se for o admin original):

```bash
docker compose exec api node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('admin123', 10);
  await p.user.update({
    where: { email: 'admin@bagre.local' },
    data: { passwordHash: hash, mustChangePwd: false, active: true }
  });
  await p.\$disconnect();
})();"
```

### Sync Zabbix falhou

Verifique no UI: `/admin/integrations` → card Zabbix → mensagem de erro mostrada explicitamente.

Se continuar:

```bash
# Logs da última sync
docker compose exec db psql -U bagre -c "
  SELECT \"lastSyncAt\", \"lastSyncStatus\", \"lastSyncMessage\"
  FROM \"ZabbixConfig\" WHERE id=1;
"
```

Forçar sync via API:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bagre.local","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -X POST http://localhost:3001/api/admin/zabbix-config/sync \
  -H "Authorization: Bearer $TOKEN"
```

### IPs do Zabbix não aparecem no IPAM

Causa típica: os IPs vivos no Zabbix **não estão em nenhuma subnet cadastrada**. Eles ficam em "fantasmas" (`ghosts` na resposta da sync).

Para resolver:
1. Identifique os ranges no Zabbix: hosts → interfaces
2. Crie as subnets correspondentes no IPAM
3. Force a sync — agora os IPs vão match

### Frontend mostra tela em branco / erro JS

```bash
# Hard reload no navegador: Cmd+Shift+R
# Verifique no DevTools (F12) → Console

# Verifique se o bundle está disponível
curl -sI http://localhost:3000/ | head -5
```

Se pegou um cache de versão antiga:
- **Limpe cache do navegador**
- Ou **rebuild forçado**: `docker compose build --no-cache web && docker compose up -d web`

### "Body cannot be empty when content-type is set to application/json"

Bug raro do helper de fetch. Já corrigido em versões atuais (o helper não envia Content-Type quando não há body).

Se aparecer: `Cmd+Shift+R` (hard reload) para pegar o JS novo.

### DB cheio / sem espaço

```bash
docker system df    # uso por imagens/contêineres/volumes
docker compose exec db psql -U bagre -c "
  SELECT pg_size_pretty(pg_database_size('bagre'));
"

# Limpar audit log antigo (cuidado, perde histórico)
docker compose exec db psql -U bagre -c "
  DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '180 days';
"

# VACUUM full após delete grande
docker compose exec db psql -U bagre -c "VACUUM FULL;"
```

---

## Operação multi-ambiente

### Dev → Staging → Produção

Sugestão de organização:

```
bagre-dev/      .env (DEV_*, JWT_SECRET aleatório)
bagre-staging/  .env (creds de staging)
bagre-prod/     .env (creds reais, secrets em vault)
```

Cada ambiente tem seu próprio `docker compose`. Banco, JWT, e tokens **devem** ser diferentes.

### Promoção de dados (nunca!)

**Não** copie banco de produção para dev. Para popular dev:

1. Use a planilha original (`data/Controle de IP - LAN.xlsx`)
2. Sincronize com um Zabbix de teste
3. Crie usuários de teste manualmente

### Variáveis em produção

```bash
# Gere secrets robustos
JWT_SECRET=$(openssl rand -base64 48)
INGEST_TOKEN=$(openssl rand -hex 24)
ADMIN_TOKEN=$(openssl rand -hex 24)

# E para credenciais sensíveis (DB, Zabbix), use um secret manager
# (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault, sealed-secrets, etc)
```

Nunca commite `.env` real ao git.

---

## Disaster recovery

### Cenário: DB corrompido

```bash
# 1. Pare o sistema
docker compose down

# 2. Apague o volume corrompido
docker volume rm bagre_db_data

# 3. Suba o sistema (DB será recriado e a planilha re-importada se for o primeiro boot)
docker compose up -d

# 4. Restaure o backup mais recente
gunzip -c backups/<latest>.sql.gz | docker compose exec -T db psql -U bagre
```

### Cenário: container API quebrado

```bash
docker compose stop api
docker compose rm -f api
docker compose build --no-cache api
docker compose up -d api
```

### Cenário: usuário admin perdido

Se você perdeu acesso a TODAS as contas admin:

```bash
docker compose exec api node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Promove o primeiro usuário a admin com senha temporária
  const u = await p.user.findFirst();
  if (!u) {
    // Cria do zero
    await p.user.create({
      data: {
        email: 'recovery@bagre.local',
        name: 'Recovery Admin',
        passwordHash: await bcrypt.hash('TempReset1234', 10),
        role: 'ADMIN',
        active: true,
        mustChangePwd: true,
      },
    });
    console.log('Created recovery@bagre.local / TempReset1234');
  } else {
    await p.user.update({
      where: { id: u.id },
      data: {
        role: 'ADMIN',
        active: true,
        passwordHash: await bcrypt.hash('TempReset1234', 10),
        mustChangePwd: true,
      },
    });
    console.log('Promoted ' + u.email + ' to ADMIN, password reset to TempReset1234');
  }
  await p.\$disconnect();
})();"
```

---

## Performance tuning

Para escalar > 100k IPs ou > 100 usuários simultâneos:

### Banco
- Aumente `shared_buffers` (Postgres): variável `POSTGRES_INITDB_ARGS`
- Habilite `pg_stat_statements` para detectar queries lentas
- Replica de leitura (`pgpool` ou Postgres logical replication)

### API
- Adicione **Redis** para cache de:
  - Sessions/JWTs revogados
  - Resultados de busca repetidos
  - Estado de scheduler
- Aumente o número de workers do Fastify (cluster mode)

### Frontend
- nginx: aumente `worker_connections` (default 1024)
- Habilite gzip e cache agressivo de assets (já habilitado)
- Use CDN para assets estáticos em produção real

### Métricas para observar
- `bagre_process_resident_memory_bytes` (RAM)
- Tempo de resposta da API (instrumentar Fastify com OTEL)
- Uso de CPU
- Latência do DB (`pg_stat_statements`)
