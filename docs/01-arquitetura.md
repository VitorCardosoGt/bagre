# Arquitetura

> Documento técnico do Bagre. Para visão funcional veja [Uso diário](./03-uso-diario.md).
> **Autor**: Fabricio Cruz

---

## Visão geral

O sistema é uma aplicação web de três camadas distribuída em três contêineres
Docker independentes. Toda comunicação entre serviços usa a rede privada do
Compose; apenas as portas necessárias são expostas no host.

```
                          ┌─────────────────────────────────┐
                          │         host (macOS/Linux)      │
                          │                                 │
   navegador  ──────►  :3000 (nginx)                        │
                          │      │                          │
                          │      ▼ proxy /api → :3001       │
                          │   :3001 (Fastify API)           │
                          │      │                          │
   curl/scripts ────────► :3001 │ JWT auth, RBAC, audit     │
                          │      │                          │
                          │      ▼                          │
                          │   :5432 (Postgres) [host :5433] │
                          │                                 │
                          └─────────────────────────────────┘

   Zabbix (overlay) :8080 ◄── opcional, para testes locais
```

## Contêineres

### `bagre-db` — PostgreSQL 16
- Imagem: `postgres:16-alpine`
- Porta exposta: `5433` no host
- Volume: `db_data` (persistente entre restarts)
- Credenciais: `bagre` / `bagre` / db `bagre`
- Healthcheck via `pg_isready`

### `bagre-api` — backend Node.js
- Imagem custom (Debian slim + Node 20 + OpenSSL)
- Porta exposta: `3001`
- Variáveis de ambiente principais:
  - `DATABASE_URL` (aponta para `db:5432`)
  - `JWT_SECRET` (assinatura de tokens)
  - `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`
  - `INGEST_TOKEN` (para integrações externas)
- Comportamento de boot:
  1. `npx prisma db push` (aplica schema)
  2. `node src/import.js --if-empty /app/seed.json` (popula da planilha se DB vazio)
  3. `node src/index.js` (inicia o servidor)

### `bagre-web` — frontend
- Build multi-stage: Node 20 (build Vite) → nginx Alpine (serve)
- Porta exposta: `3000`
- nginx faz proxy reverso de `/api` e `/metrics` para o serviço `api:3001`
- SPA fallback: rotas que não existem fisicamente caem em `/index.html`

### `bagre-zabbix-*` (overlay opcional)
Para testes locais: `docker-compose.zabbix-dev.yml` adiciona um Zabbix completo
(DB próprio + server + web). Não roda em produção. Detalhes em
[Integrações](./05-integracoes.md).

---

## Modelo de dados

Schema Prisma em `apps/api/prisma/schema.prisma`. Resumo das tabelas principais:

### Core (gestão de endereçamento)

```prisma
model Site {
  id          Int      @id @default(autoincrement())
  code        String   @unique
  name        String
  description String?
  subnets     Subnet[]
}

model Subnet {
  id          Int        @id @default(autoincrement())
  siteId      Int
  site        Site       @relation(...)
  name        String
  cidr        String?
  cidrLabel   String?
  vlanId      Int?
  description String?
  ips         IpAddress[]
  @@unique([siteId, name])
}

enum IpStatus { FREE USED RESERVED CONFLICT }

model IpAddress {
  id             Int       @id @default(autoincrement())
  subnetId       Int
  subnet         Subnet    @relation(...)
  address        String
  type           String?   // "Servidor Linux", "Switch Cisco", etc
  hostname       String?
  function       String?
  status         IpStatus  @default(FREE)
  notes          String?
  // Enriquecimento automático (Zabbix/scanners)
  macAddress     String?
  osInfo         String?   // "Ubuntu 22.04 LTS", "Windows Server 2019"
  vendor         String?
  model          String?
  // Liveness
  lastSeenAt     DateTime?
  lastSeenSource String?   // "zabbix" | "nmap-agent" | "manual"
  externalRef    String?   // "zabbix:host:1042"
  @@unique([subnetId, address])
  @@index([address])
  @@index([hostname])
  @@index([macAddress])
  @@index([lastSeenAt])
}
```

### Auth e RBAC

```prisma
enum Role { ADMIN READER }

model User {
  id             Int       @id @default(autoincrement())
  email          String    @unique
  name           String?
  passwordHash   String?
  role           Role      @default(READER)
  active         Boolean   @default(true)
  mustChangePwd  Boolean   @default(false)
  authProvider   String    @default("local") // local | oidc
  externalId     String?   @unique
  externalGroups String[]  @default([])
  lastLoginAt    DateTime?
}

model PasswordResetToken {
  id         Int       @id @default(autoincrement())
  userId     Int
  token      String    @unique
  expiresAt  DateTime
  consumedAt DateTime?
}
```

### Auditoria e configurações

```prisma
model AuditLog {
  id        Int      @id @default(autoincrement())
  entity    String   // "site" | "subnet" | "ip" | "user" | "zabbix_config" | etc
  entityId  Int
  action    String   // "create" | "update" | "delete" | "login" | "sync" | etc
  before    Json?    // estado anterior (para updates/deletes)
  after     Json?    // estado novo (para creates/updates)
  actor     String?  // email do usuário, ou "ingest", "oidc", etc
  createdAt DateTime @default(now())
}

model OidcConfig    { /* configuração SSO Microsoft Entra ID */ }
model ZabbixConfig  { /* configuração da integração Zabbix */ }
model FirewallRule  { /* regras importadas da aba "Azure - SCE" */ }
model EquinixVlan   { /* VLANs Equinix importadas da planilha */ }
model AzureSubnet   { /* subnets Azure importadas da planilha */ }
model MasterRange   { /* CIDRs mestres da empresa */ }
model CidrReference { /* tabela de referência prefixo→máscara */ }
```

---

## Estrutura de pastas

```
bagre/
├── docker-compose.yml              # stack principal
├── docker-compose.zabbix-dev.yml   # overlay opcional
├── .env / .env.example
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── prisma/schema.prisma    # modelo de dados
│   │   └── src/
│   │       ├── index.js            # bootstrap do Fastify
│   │       ├── db.js               # cliente Prisma compartilhado
│   │       ├── auth.js             # guards (requireAuth, requireAdmin)
│   │       ├── audit.js            # logger de auditoria
│   │       ├── cidr.js             # math IPv4 (expandCidr, etc)
│   │       ├── import.js           # importador da planilha → DB
│   │       ├── auth-providers/
│   │       │   └── oidc.js         # cliente OIDC (Entra ID)
│   │       ├── integrations/
│   │       │   └── zabbix.js       # cliente JSON-RPC + scheduler
│   │       └── routes/             # endpoints (sites, subnets, ips, etc)
│   └── web/
│       ├── Dockerfile (multi-stage)
│       ├── nginx.conf              # proxy /api e /metrics
│       ├── package.json
│       ├── vite.config.js
│       ├── tailwind.config.js
│       └── src/
│           ├── main.jsx            # entrypoint React
│           ├── App.jsx             # router + rotas protegidas
│           ├── api.js              # cliente fetch + auth
│           ├── auth/AuthContext.jsx
│           ├── components/         # Layout, Modal, Toast, etc
│           └── pages/              # uma rota por arquivo
├── data/
│   └── Controle de IP - LAN.xlsx   # planilha original (read-only)
├── scripts/
│   ├── extract_xlsx.py             # xlsx → seed.json
│   ├── seed-zabbix-dev.mjs         # popula Zabbix de teste
│   ├── update-metas.mjs            # gera METAS.md + metas.html
│   └── record-demo.mjs             # gera vídeo demo via Playwright
├── schema/
│   └── bagre.project.schema.json
├── docs/                           # esta documentação
└── demos/                          # vídeos gerados
```

---

## Segurança

### Autenticação
- **JWT HS256** com `JWT_SECRET` configurável (padrão dev: `please-change-this-secret-32-chars-min`)
- TTL do token: **8 horas**
- Senha local com **bcrypt** (cost factor 10)
- SSO via **OIDC** opcional (PKCE + state + nonce)

### Autorização
Hook global `onRequest` no Fastify:
1. Skip para rotas em `PUBLIC` (login, reset, health, /metrics, ingest)
2. Verifica JWT
3. Carrega usuário do DB (recheca `active`)
4. Para métodos de escrita (POST/PATCH/PUT/DELETE), exige `role=ADMIN`

Endpoints sensíveis (sem JWT) protegidos por tokens dedicados:
- `INGEST_TOKEN` — para POST `/api/ingest/*` (scanners, OTEL collectors)
- `ADMIN_TOKEN` — para POST `/api/import/seed` (reimportar planilha)

### Auditoria
Todo mutador chama `auditFromReq(req, { entity, entityId, action, before, after })`.
Tokens e secrets são **mascarados** antes de virar log (ex: `••••••••AB12`).

### CORS
Habilitado com `credentials: true`. Em produção, restringir origens via env var.

---

## Fluxos críticos

### 1. Login local
```
POST /api/auth/login {email, password}
  → bcrypt.compare → ok
  → atualiza lastLoginAt
  → audit (action=login)
  → reply.jwtSign
  → 200 { token, user }
```

### 2. Login via SSO (Entra ID)
```
GET /api/auth/sso/start
  → cookie HttpOnly com state/nonce/codeVerifier
  → 302 redirect para Microsoft

GET /api/auth/sso/callback?code=&state=
  → openid-client validates
  → fetch userinfo
  → upsert User (matching externalId ou email)
  → mapRole baseado em groups
  → reply.jwtSign
  → redirect para frontend /sso-callback?token=
```

### 3. Sincronização Zabbix
```
scheduler tick (a cada N min) ou POST /api/admin/zabbix-config/sync
  → host.get com selectInventory: 'extend'
  → para cada interface IP, monta discovery
  → applyDiscoveries → busca IpAddress por address → update
  → ZabbixConfig.lastSync* atualizado
  → audit (entity=zabbix_config, action=sync)
```

### 4. Edição inline de IP
```
PATCH /api/ips/:id  { hostname, type, function, ... }
  → fetchBefore
  → inferStatus (FREE se vazio, USED se preenchido, ou explícito)
  → update
  → audit (entity=ip, action=update, before, after)
```

---

## Performance e escalabilidade

### Índices ativos
- `IpAddress.address` (busca por IP)
- `IpAddress.hostname` (busca por nome)
- `IpAddress.macAddress`
- `IpAddress.lastSeenAt` (saúde da rede)
- `Site.code`, `Subnet.(siteId,name)`, `User.email`, `User.externalId` (uniques)
- `AuditLog.(entity, entityId)` (drill-down por entidade)

### Limites operacionais

| Métrica | Limite atual | Como aumentar |
|---|---|---|
| IPs por subnet (geração) | 4096 | Editar `expandCidr` em `cidr.js` |
| Tamanho de upload | 50 MB | `multipart.fileSize` em `index.js` |
| Concurrent connections | herda do nginx (1024) | nginx.conf |
| TTL de sessão | 8h | `TOKEN_TTL_MIN` em `routes/auth.js` |

### Capacity planning

Em escala atual (10k IPs, 50 subnets, 10 usuários simultâneos):
- DB usa < 50 MB
- API usa < 100 MB de RAM
- Tempo médio de resposta: < 50ms para CRUD, < 200ms para search global

Para escalar 100×:
- Adicionar **Redis** para cache de sessão e listas
- Replicação Postgres para read scaling
- nginx com SSL terminator e rate limiting
