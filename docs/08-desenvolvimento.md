# Desenvolvimento

> Guia para desenvolvedores: estrutura de código, dev local, build, contribuir.
> **Autor**: Fabricio Cruz

---

## Setup de dev

### Opção A — usando os contêineres (recomendado)

A stack toda roda em Docker, igual produção. Mudanças no código requerem rebuild:

```bash
docker compose up -d --build api web
```

Para ver logs em tempo real:

```bash
docker compose logs -f api
```

### Opção B — backend local + DB no contêiner

Mais rápido para iteração:

```bash
# Sobe só o DB
docker compose up -d db

# API local
cd apps/api
npm install
DATABASE_URL=postgresql://bagre:bagre@localhost:5433/bagre \
  JWT_SECRET=dev-secret \
  npx prisma db push
npm run dev   # nodemon-like, recarrega em mudanças

# Frontend local (em outro terminal)
cd apps/web
npm install
npm run dev   # Vite, HMR a cada save
```

Frontend dev em `http://localhost:5173` (Vite). O proxy Vite encaminha `/api` para `http://localhost:3001`.

---

## Estrutura do código

### Backend (`apps/api/src`)

```
src/
├── index.js              # bootstrap Fastify + registra plugins/rotas
├── db.js                 # Prisma Client compartilhado (singleton)
├── auth.js               # bootstrap admin + guards (requireAuth, requireAdmin)
├── audit.js              # logger de auditoria
├── cidr.js               # math IPv4 (parseCidr, expandCidr)
├── import.js             # importador da planilha → DB
├── auth-providers/
│   └── oidc.js           # cliente OIDC (Entra ID)
├── integrations/
│   └── zabbix.js         # cliente JSON-RPC + scheduler + sync
└── routes/
    ├── sites.js          # CRUD sites
    ├── subnets.js        # CRUD subnets + auto-gen IPs
    ├── ips.js            # PATCH/release/reserve
    ├── search.js         # /api/search
    ├── catalogs.js       # ranges, vlans, azure subnets
    ├── firewall.js       # CRUD regras firewall
    ├── stats.js          # /api/stats /api/stats/by-site
    ├── ingest.js         # /api/ingest/*
    ├── metrics.js        # /metrics Prometheus
    ├── auth.js           # login, change-password, reset
    ├── users.js          # CRUD usuários
    ├── audit.js          # GET /api/audit
    ├── oidc.js           # SSO config + start/callback
    ├── zabbix.js         # config + test + sync
    ├── network-health.js # GET /api/network-health
    ├── integrations-status.js # status consolidado
    └── import.js         # POST /api/import/seed
```

### Frontend (`apps/web/src`)

```
src/
├── main.jsx              # entrypoint React + providers (Auth, Toast, Query)
├── App.jsx               # router + rotas protegidas
├── api.js                # cliente fetch + auth helpers
├── index.css             # Tailwind base + componentes (.card, .btn, .badge)
├── auth/
│   └── AuthContext.jsx   # provider de auth
├── components/
│   ├── Layout.jsx        # sidebar + header + tema
│   ├── GlobalSearch.jsx  # ⌘K
│   ├── PageHeader.jsx    # cabeçalho consistente
│   ├── Modal.jsx         # modal genérico
│   ├── ConfirmDialog.jsx # confirmação de ação destrutiva
│   ├── SiteFormModal.jsx
│   ├── SubnetFormModal.jsx
│   ├── StatusBadge.jsx
│   └── Toast.jsx         # provider + useToast
└── pages/
    ├── Login.jsx
    ├── Reset.jsx
    ├── Profile.jsx
    ├── SsoCallback.jsx
    ├── Dashboard.jsx
    ├── Sites.jsx
    ├── SubnetDetail.jsx
    ├── Catalogs.jsx
    ├── Firewall.jsx
    ├── CidrCalculator.jsx
    ├── IntegrationDocs.jsx
    ├── Users.jsx               (admin)
    ├── Audit.jsx               (admin)
    ├── NetworkHealth.jsx       (admin)
    ├── IntegrationsStatus.jsx  (admin)
    ├── ZabbixSettings.jsx      (admin)
    └── SsoSettings.jsx         (admin)
```

---

## Adicionar uma nova rota (backend)

1. Crie o arquivo em `apps/api/src/routes/`:

```js
// apps/api/src/routes/widgets.js
import { prisma } from '../db.js';
import { auditFromReq } from '../audit.js';

export async function registerWidgets(app) {
  app.get('/api/widgets', async () => {
    return prisma.widget.findMany();
  });

  app.post('/api/widgets', async (req) => {
    const created = await prisma.widget.create({ data: req.body });
    await auditFromReq(req, {
      entity: 'widget',
      entityId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  });
}
```

2. Registre em `index.js`:

```js
import { registerWidgets } from './routes/widgets.js';
// ...
await registerWidgets(app);
```

3. Reinicie a API. O hook global `onRequest` cuida de auth + RBAC automaticamente.

---

## Adicionar uma nova página (frontend)

1. Crie `apps/web/src/pages/Widgets.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

export default function Widgets() {
  const { data, isLoading } = useQuery({
    queryKey: ['widgets'],
    queryFn: api.widgets,
  });
  return (
    <div>
      <PageHeader title="Widgets" description="..." />
      {isLoading ? <p>Carregando…</p> : <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
```

2. Adicione no cliente API (`apps/web/src/api.js`):

```js
widgets: () => request('/widgets'),
```

3. Adicione a rota em `App.jsx`:

```jsx
import Widgets from './pages/Widgets.jsx';
// ...
<Route path="/widgets" element={<Widgets />} />
```

4. Adicione na sidebar em `components/Layout.jsx` (se for navegável).

---

## Schema Prisma

Editar `apps/api/prisma/schema.prisma`. Após mudanças:

```bash
# Em dev (drop-and-recreate via db push)
docker compose exec api npx prisma db push

# Em produção (cria migration versionada)
docker compose exec api npx prisma migrate dev --name nome-da-mudanca
```

Regenerar o cliente Prisma (necessário após mudar o schema):

```bash
docker compose exec api npx prisma generate
```

---

## Convenções de código

### Geral
- Idioma: **português brasileiro** em mensagens de UI, comentários, descrições. **Inglês** em nomes de variáveis/funções/arquivos.
- Indentação: 2 espaços
- Aspas: simples no JS, duplas no JSX
- Imports: ordem padrão (built-in → externos → internos)

### Backend
- **Async/await** sempre, sem callbacks
- Erros lançados com `Error` padrão; Fastify retorna 500
- Para erros esperados, set `err.statusCode` e jogue
- Audit em **todo** mutador (CRUD)

### Frontend
- Componentes funcionais, hooks
- TanStack Query para todo dado de servidor (não use useState direto)
- Toast para feedback de ação (use `useToast()`)
- Confirmação destrutiva via `ConfirmDialog`
- Estilo via Tailwind classes; componentes reutilizáveis em `components/`

---

## Build de produção

### API
```bash
cd apps/api
docker build -t bagre-api:prod .
```

A imagem tem ~250 MB. Inclui Node 20, OpenSSL, deps de produção, schema Prisma compilado.

### Web
```bash
cd apps/web
docker build -t bagre-web:prod --build-arg VITE_API_URL=/api .
```

Multi-stage:
1. Build via Vite (output em `dist/`)
2. Serve via nginx Alpine

A imagem tem ~50 MB.

---

## Scripts úteis

### Extração da planilha
```bash
python3 scripts/extract_xlsx.py
# Lê data/Controle de IP - LAN.xlsx
# Gera scripts/seed.json
```

### Atualizar dashboard de metas
```bash
node scripts/update-metas.mjs
node scripts/update-metas.mjs --watch    # regenera em qualquer mudança
```

### Popular Zabbix dev
```bash
node scripts/seed-zabbix-dev.mjs
```

### Gravar vídeo demo
```bash
node scripts/record-demo.mjs
# Gera demos/integration-demo.mp4 via Playwright + ffmpeg
```

---

## Ferramentas recomendadas

| Para | Ferramenta |
|---|---|
| Editor | VS Code com Prisma extension, Tailwind IntelliSense, ESLint |
| API testing | Insomnia / Postman / `curl` com `xh` |
| DB GUI | TablePlus / DBeaver / `pgcli` |
| Logs | `lazydocker` |
| Capturar UI | Playwright (incluso no projeto) |

---

## Como contribuir

1. Crie um branch a partir de `main`: `git checkout -b feat/minha-feature`
2. Implemente + adicione testes (quando houver suite)
3. Verifique manualmente: `docker compose up -d --build`
4. Documente: atualize o doc relevante em `docs/`
5. Commit com mensagem descritiva (em pt-BR ou en, consistente com o repo)
6. Abra PR / submit ao processo interno

### Checklist antes de pedir review

- [ ] `docker compose up --build` funciona do zero
- [ ] Login funciona, navegação básica OK
- [ ] Auditoria registra a operação nova (se for CRUD)
- [ ] Permissões funcionam (READER bloqueado em escritas)
- [ ] Documentação atualizada
- [ ] Sem secrets hardcoded
- [ ] Sem `console.log` esquecido

---

## Roadmap técnico (sugestões)

Em ordem de impacto:

1. **Tags** em sites/subnets/IPs — habilita FinOps e Tele\*
2. **Sync Azure Resource Manager** — espelha vNets/NSGs/FrontDoor
3. **Webhooks de saída** — para Teams/Slack/n8n
4. **Tokens API por integração** (substituir o `INGEST_TOKEN` global)
5. **2FA TOTP** para contas locais
6. **OTEL traces** instrumentando Fastify+Prisma
7. **IPv6**
8. **Workflow de aprovação** para alocação de IPs (pra times grandes)
9. **Dashboard Grafana pré-pronto** num container ao lado
10. **Backup automatizado** com retenção e upload pra cloud

Cada item tem detalhes em `METAS.md` e contexto de prioridade no dashboard `metas.html`.
