# API REST

> Referência completa dos endpoints com exemplos `curl`.
> **Autor**: Fabricio Cruz

---

## Convenções

- **Base URL** local: `http://localhost:3001`
- **Auth**: header `Authorization: Bearer <JWT>` (exceto rotas públicas)
- **Content-Type**: `application/json` quando há body
- Em produção, fica atrás do nginx que faz proxy de `/api` → `:3001`

### Como obter um JWT

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bagre.local","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
```

Use `-H "Authorization: Bearer $TOKEN"` em todas as chamadas autenticadas.

### Códigos de resposta

| Código | Significado |
|---|---|
| 200 | OK |
| 400 | Body/query inválido |
| 401 | Não autenticado / token inválido |
| 403 | Autenticado mas sem permissão (precisa ADMIN) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: email duplicado) |
| 500 | Erro inesperado |

---

## Auth

### POST `/api/auth/login` (público)

```bash
curl -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bagre.local","password":"admin123"}'
```

Response:
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 1, "email": "admin@bagre.local",
    "name": "Administrator", "role": "ADMIN",
    "mustChangePwd": false
  }
}
```

### GET `/api/auth/me`

```bash
curl $API/api/auth/me -H "Authorization: Bearer $TOKEN"
```

### POST `/api/auth/change-password`

```bash
curl -X POST $API/api/auth/change-password \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"velha","newPassword":"nova123"}'
```

### POST `/api/auth/reset-request` (público)

Solicita reset. Sempre retorna 200 (anti-enumeração).

```bash
curl -X POST $API/api/auth/reset-request \
  -H 'Content-Type: application/json' \
  -d '{"email":"alguem@empresa"}'
```

Token é gravado nos logs do servidor.

### POST `/api/auth/reset` (público)

Aplica o token gerado:

```bash
curl -X POST $API/api/auth/reset \
  -H 'Content-Type: application/json' \
  -d '{"token":"abc123...","newPassword":"nova123"}'
```

### GET `/api/auth/sso/start` (público)

Inicia fluxo OIDC. Retorna 302 redirect ao Entra ID. Use diretamente no browser, não via curl.

### GET `/api/auth/sso/callback` (público)

Callback do Entra ID. O navegador é redirecionado de volta automaticamente.

---

## Sites

### GET `/api/sites`

Lista todos os sites com suas subnets:

```bash
curl $API/api/sites -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "id": 1, "code": "SP3", "name": "Data Center SP3",
    "subnets": [
      {
        "id": 1, "name": "sp3-prod-srv", "cidr": "10.20.10.0/24",
        "ipCount": 254, "usedCount": 17, ...
      }
    ]
  }, ...
]
```

### POST `/api/sites` (ADMIN)

```bash
curl -X POST $API/api/sites -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"code":"NEW-DC","name":"Novo data center","description":"opcional"}'
```

### PATCH `/api/sites/:id` (ADMIN)

```bash
curl -X PATCH $API/api/sites/2 -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Renomeado"}'
```

### DELETE `/api/sites/:id` (ADMIN)

```bash
curl -X DELETE $API/api/sites/2 -H "Authorization: Bearer $TOKEN"
```

Cascateia: apaga subnets e IPs vinculados.

---

## Subnets

### GET `/api/subnets/:id`

```bash
curl $API/api/subnets/5 -H "Authorization: Bearer $TOKEN"
```

### GET `/api/subnets/:id/ips`

Lista IPs da subnet, com filtros opcionais:

```bash
curl "$API/api/subnets/5/ips?status=USED&q=srv" -H "Authorization: Bearer $TOKEN"
```

Query params:
- `status` — `FREE | USED | RESERVED | CONFLICT`
- `q` — busca substring em address, hostname, type, function

### POST `/api/subnets` (ADMIN)

Cria subnet **e gera todos os IPs automaticamente** se CIDR for fornecido:

```bash
curl -X POST $API/api/subnets -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "siteId": 1,
    "name": "LAN-PROD",
    "cidr": "10.150.5.0/24",
    "vlanId": 510
  }'
```

Response inclui `ipsCreated`. Limite: 4096 IPs por subnet.

### PATCH `/api/subnets/:id` (ADMIN)

```bash
curl -X PATCH $API/api/subnets/5 -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Atualizada"}'
```

CIDR não pode mudar.

### DELETE `/api/subnets/:id` (ADMIN)

Cascateia: apaga IPs.

---

## IPs

### PATCH `/api/ips/:id` (ADMIN)

Edita campos do IP. Status é inferido automaticamente:

```bash
curl -X PATCH $API/api/ips/12345 -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"hostname":"srv-novo","type":"Servidor","function":"Web"}'
```

Se você preencher campos, status vira `USED`. Se enviar todos vazios, vira `FREE`.

### POST `/api/ips/:id/release` (ADMIN)

Libera IP (limpa metadados, status=FREE):

```bash
curl -X POST $API/api/ips/12345/release -H "Authorization: Bearer $TOKEN"
```

### POST `/api/ips/:id/reserve` (ADMIN)

Marca como reservado:

```bash
curl -X POST $API/api/ips/12345/reserve -H "Authorization: Bearer $TOKEN"
```

---

## Busca

### GET `/api/search?q=`

Busca global em IPs, subnets, sites:

```bash
curl "$API/api/search?q=10.150.0" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "ips": [...],
  "subnets": [...],
  "sites": [...]
}
```

Mínimo 2 caracteres.

---

## Stats

### GET `/api/stats`

```bash
curl $API/api/stats -H "Authorization: Bearer $TOKEN"
```

```json
{
  "siteCount": 9, "subnetCount": 41, "ipCount": 10414,
  "used": 261, "reserved": 0, "free": 10153,
  "recent": [...]
}
```

### GET `/api/stats/by-site`

Estatísticas por site (para dashboards):

```bash
curl $API/api/stats/by-site -H "Authorization: Bearer $TOKEN"
```

---

## Catálogos (read-only)

```bash
GET /api/master-ranges     # ranges mestre da empresa
GET /api/equinix-vlans     # VLANs 
GET /api/azure-subnets     # subnets das vNets Azure
GET /api/cidr-reference    # tabela /0 a /32
```

---

## Firewall

```bash
GET    /api/firewall-rules
POST   /api/firewall-rules           # ADMIN
PATCH  /api/firewall-rules/:id       # ADMIN
DELETE /api/firewall-rules/:id       # ADMIN
```

---

## Usuários (ADMIN)

```bash
GET    /api/users
POST   /api/users                # cria; se sem password, devolve resetToken
PATCH  /api/users/:id            # name, role, active
DELETE /api/users/:id
POST   /api/users/:id/reset      # gera novo token de reset
```

Exemplo de criação com link de reset:

```bash
curl -X POST $API/api/users -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"novo@empresa","name":"Novo Usuário","role":"READER"}'
# {
#   "user": {...},
#   "resetToken": "abc123..."
# }
# Link a entregar: $WEB/reset?token=abc123...
```

---

## Auditoria (ADMIN)

### GET `/api/audit`

```bash
curl "$API/api/audit?entity=ip&action=update&take=50" \
  -H "Authorization: Bearer $TOKEN"
```

Query params:
- `entity` — `ip | site | subnet | user | zabbix_config | oidc_config | firewall_rule`
- `action` — `create | update | delete | sync | login | reset_password | etc`
- `actor` — substring (case-insensitive)
- `take` — máx 500 (padrão 100)
- `skip` — paginação

Cada item tem `before` e `after` em JSON com o estado anterior/novo.

### GET `/api/audit/entities`

Lista os valores distintos de `entity` e `action` presentes no log (para popular filtros na UI).

---

## Saúde da rede (ADMIN)

### GET `/api/network-health`

```bash
curl $API/api/network-health -H "Authorization: Bearer $TOKEN"
```

```json
{
  "staleAfterDays": 7,
  "stale": [...IPs marcados USED sem responder há > 7d...],
  "conflicts": [...IPs com status CONFLICT...],
  "sources": [{"source":"zabbix","count":15}]
}
```

---

## Status das integrações (ADMIN)

### GET `/api/admin/integrations/status`

```bash
curl $API/api/admin/integrations/status -H "Authorization: Bearer $TOKEN"
```

Retorno consolidado: estado de cada integração (Zabbix, OIDC), eventos recentes, indicador geral.

---

## Configuração Zabbix (ADMIN)

```bash
GET   /api/admin/zabbix-config              # lê (secrets mascarados)
PATCH /api/admin/zabbix-config              # atualiza
POST  /api/admin/zabbix-config/test         # testa conexão (live)
POST  /api/admin/zabbix-config/sync         # força sincronização
```

Exemplo:

```bash
curl -X PATCH $API/api/admin/zabbix-config \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"https://zabbix.empresa","apiToken":"abc","intervalMinutes":15}'

curl -X POST $API/api/admin/zabbix-config/test -H "Authorization: Bearer $TOKEN"
# {"ok":true,"message":"Conexão e auth OK · Zabbix 7.0.26"}

curl -X POST $API/api/admin/zabbix-config/sync -H "Authorization: Bearer $TOKEN"
# {"ok":true,"hosts":17,"updated":15,"ghosts":["172.16.99.99","127.0.0.1"]}
```

---

## Configuração OIDC (ADMIN)

```bash
GET   /api/admin/oidc-config              # lê (secret mascarado)
PATCH /api/admin/oidc-config              # atualiza
POST  /api/admin/oidc-config/test         # discovery do issuer
GET   /api/config                         # PÚBLICO — informa se SSO está habilitado
```

---

## Ingestão (token-based)

Auth: `X-Ingest-Token: $INGEST_TOKEN`. Não usa JWT.

### POST `/api/ingest/discoveries`

```bash
curl -X POST $API/api/ingest/discoveries \
  -H 'Content-Type: application/json' \
  -H "X-Ingest-Token: $INGEST_TOKEN" \
  -d '{
    "discoveries": [
      {
        "address": "10.150.0.50",
        "hostname": "srv-novo",
        "type": "Servidor",
        "macAddress": "AA:BB:CC:DD:EE:FF",
        "osInfo": "Ubuntu 22.04",
        "source": "nmap-scanner"
      }
    ]
  }'
```

```json
{ "received":1, "updated":1, "unmatched":[], "errors":[] }
```

### POST `/api/ingest/heartbeat`

```bash
curl -X POST $API/api/ingest/heartbeat \
  -H 'Content-Type: application/json' \
  -H "X-Ingest-Token: $INGEST_TOKEN" \
  -d '{"address":"10.150.0.50","alive":true,"source":"blackbox"}'
```

---

## Importação

### POST `/api/import/seed`

Auth: `X-Admin-Token: $ADMIN_TOKEN`. Reimporta a planilha (idempotente).

```bash
curl -X POST $API/api/import/seed -H "X-Admin-Token: $ADMIN_TOKEN"
```

Útil para automação. Pode ser chamado quando o `seed.json` mudar (ex: pipeline CI que regenera o JSON quando a planilha for atualizada).

---

## Métricas e healthcheck

### GET `/api/health` (público)

```bash
curl $API/api/health
# {"ok":true,"ts":"2026-05-08T..."}
```

Use em healthchecks de container/Kubernetes.

### GET `/metrics` (público — Prometheus)

```bash
curl $API/metrics | head -20
```

---

## Headers úteis em chamadas de automação

| Header | Uso |
|---|---|
| `Authorization: Bearer <JWT>` | Auth de usuário |
| `X-Ingest-Token: <token>` | Auth de scanner/automação |
| `X-Admin-Token: <token>` | Auth para reimportação |
| `X-Actor: <nome-da-ferramenta>` | Override do actor no audit (opcional, alternativa a JWT) |

---

## Variáveis usadas nos exemplos

```bash
export API=http://localhost:3001
export WEB=http://localhost:3000
export INGEST_TOKEN=$(grep INGEST_TOKEN .env | cut -d= -f2)
export ADMIN_TOKEN=$(grep ADMIN_TOKEN .env | cut -d= -f2)
export TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bagre.local","password":"admin123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
```
