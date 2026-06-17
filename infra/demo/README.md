# Ambiente de demonstração — demo.bagre.dev

Demo público com **descoberta de hosts via Zabbix** (fluxo pending → aprovação 1 clique).
Cloud/LocalStack/FinOps é fast-follow — não está incluído aqui.

## Subir localmente

Pré-requisitos: Docker daemon rodando, `.env` com `JWT_SECRET` (≥32 chars).

```sh
docker compose \
  -f docker-compose.yml \
  -f docker-compose.zabbix-dev.yml \
  -f docker-compose.demo.yml \
  up -d --build
```

O que acontece no boot:
1. `db`, `zabbix-db/server/web` sobem.
2. `zabbix-seed` (one-shot) popula 13–17 hosts no Zabbix (retry até ficar pronto).
3. `api` roda `prisma db push` → `import.js` → **`demo-seed.mjs`** (usuários demo,
   fixa a integração Zabbix em `http://zabbix-web:8080`, sync inicial) → servidor.

Acesse `http://localhost:3000` → botões "Entrar como Admin/Leitor (demo)".

## Verificação E2E

```sh
# 1. flag de demo ativa
curl -s localhost:3001/api/config | grep -o '"demo":{[^}]*"enabled":true'

# 2. login demo e token
TOKEN=$(curl -s localhost:3001/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo-admin@bagre.dev","password":"demo-admin"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# 3. pending discoveries (~13–17 hosts). Se vazio, forçar sync e re-checar:
curl -s -H "authorization: Bearer $TOKEN" "localhost:3001/api/pending-discoveries?status=PENDING" | head -c 400
curl -s -X POST -H "authorization: Bearer $TOKEN" localhost:3001/api/admin/zabbix-config/sync

# 4. guard anti-SSRF: a URL do Zabbix deve ficar fixa mesmo se tentarem trocar
curl -s -X PATCH -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"url":"http://169.254.169.254"}' localhost:3001/api/admin/zabbix-config | grep -o '"url":"[^"]*"'
```

## Deploy na VPS (demo.bagre.dev)

1. DNS: A record `demo.bagre.dev` → IP da VPS.
2. Reverse proxy (nginx/Caddy/Traefik) com TLS → container `web` (porta 3000).
   **Não** publicar portas do Zabbix (8080/10051) publicamente — só rede interna.
3. `.env` com `JWT_SECRET` forte. Senhas demo podem ficar nos defaults (públicas de propósito).
4. Reset diário (cron, 04h BRT):

```cron
0 4 * * *  CRON_TZ=America/Sao_Paulo  flock -n /tmp/bagre-reset.lock /opt/bagre/infra/demo/reset.sh >> /var/log/bagre-demo-reset.log 2>&1
```

## Recursos (memória)

api 512m · db 512m · web 128m · zabbix-server/db 512m cada · zabbix-web 256m ≈ **2.4 GB**.
VPS de 4 GB roda folgado (sem LocalStack neste corte).
