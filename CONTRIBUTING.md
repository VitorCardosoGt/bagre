# Contribuindo para o Bagre

Obrigado pelo interesse em contribuir. Este documento descreve como participar do projeto.

## Princípios do projeto

Antes de propor uma feature, leia o [ROADMAP.md](ROADMAP.md). Decisões de aceitação seguem 7 princípios inegociáveis:

1. **Simples antes de completo** — toda feature precisa justificar sua complexidade.
2. **Cloud-native first** — Terraform, Kubernetes e clouds públicas têm prioridade.
3. **IPv4 e IPv6 com mesmo peso.**
4. **API-first** — toda funcionalidade da UI tem endpoint REST equivalente.
5. **Auditável por design** — mutação sem actor + diff não existe.
6. **Onboarding em minutos** — se passou de cinco, é bug.
7. **Sem dependência de SaaS proprietário.**

## Como contribuir

### Reportar bug

1. Procure se já existe issue aberta com o mesmo problema.
2. Se não, abra uma com:
   - **Versão do Bagre** (ex: v0.2.0, commit `abc123`)
   - **Reprodução** passo a passo
   - **Comportamento esperado vs observado**
   - **Logs relevantes** (use \`\`\`logs\`\`\` para formatar)
   - **Ambiente** — Docker / bare metal, OS, Node version

### Sugerir feature

1. Olhe o ROADMAP — pode já estar planejada.
2. Abra uma issue **descrevendo o problema, não a solução**. "Preciso de X porque Y" é melhor que "implementem feature Z".
3. Aguarde discussão antes de implementar. Features grandes sem alinhamento prévio têm chance baixa de aceitação.

### Enviar PR

Pra mudanças pequenas (typo, bug óbvio, doc), pode ir direto. Pra qualquer coisa maior, alinhe em uma issue antes.

**Fluxo:**

1. Fork e clone.
2. Crie branch a partir de `main`: `git checkout -b feat/minha-feature` ou `fix/algum-bug`.
3. Faça as mudanças seguindo as convenções abaixo.
4. Rode CI local: `cd apps/api && npm ci && npx prisma generate && cd ../web && npm ci && npm run build`.
5. Commit com mensagem descritiva (veja convenção abaixo).
6. Push e abra PR contra `main`.

## Convenções

### Commits

Não usamos Conventional Commits formal, mas o estilo segue um padrão:

- **Subject line** em inglês, modo imperativo, ≤72 chars
- **Body** opcional descrevendo *por que* e *como*, não só *o que*
- **Sem emojis** em commits

Exemplos do histórico:

```
Fix quickstart: HTTP on :3000, drop required TLS certs and seed mount
Refactor: generalize 'EquinixVlan' → 'DatacenterVlan' + add CHANGELOG
ui: rename ambiguous menu items — 'Documentação API' vs 'Conexões'
security: fail-closed defaults — no more "admin123" / placeholder secrets
```

### Código

**Backend (apps/api):**
- Node 20, ES modules (\`type: module\` no package.json)
- Fastify para rotas, Prisma para DB
- Rotas em `apps/api/src/routes/<feature>.js`, exportando `registerXxx(app)`
- Auth global por hook em `apps/api/src/index.js` — para rota pública, adicione na Set `PUBLIC`
- Toda mutação chama `audit()` ou `auditFromReq()`

**Frontend (apps/web):**
- React 18, Vite, Tailwind, React Query, React Router
- Componentes em `apps/web/src/components/`, páginas em `apps/web/src/pages/`
- API client centralizado em `apps/web/src/api.js`
- Sem inline styles — Tailwind classes

**Estilo geral:**
- Sem ESLint config opinada por ora — mas mantenha consistente com o código vizinho
- Funções pequenas, nomes claros, comentários explicando *por que* (não *o que*)
- Sem `console.log` em código de produção; use `app.log.info/warn/error` no backend

### Schema (Prisma)

- Em dev: `npx prisma db push --accept-data-loss` no container API (já no CMD)
- Em prod: migrations via `prisma migrate deploy` (ainda não documentado para usuários, em #11/#12)
- Nomeação de models em PascalCase singular (\`Subnet\`, \`CloudAccount\`)
- Campos cloud-aware seguem o padrão `cloudAccountId`, `cloudResourceId`, `cloudMetadata` (vide IpAddress / Subnet)

## Onde achar coisas

- **Backend rotas** — `apps/api/src/routes/`
- **Integrações externas** — `apps/api/src/integrations/` (zabbix, cloud/aws, etc)
- **Schema** — `apps/api/prisma/schema.prisma`
- **Pages** — `apps/web/src/pages/`
- **Layout / nav** — `apps/web/src/components/Layout.jsx`
- **Docs** — `docs/01-*.md` até `docs/08-*.md`
- **Notas pra agentes IA / overview rápido** — `AGENTS.md`

## CI

PRs disparam o workflow `.github/workflows/ci.yml`:
- `apps/api`: install + `prisma generate` + syntax check
- `apps/web`: install + `vite build`

PR só faz merge se CI passar.

## Comunicação

- **Issues** para problemas concretos
- **Discussions** para perguntas abertas e ideias maiores
- **PRs** com descrição clara — se mudou schema, mencione "requer prisma db push"

## Código de conduta

Sê respeitoso. Discorde da ideia, não da pessoa. Maintenedor reserva o direito de fechar discussões que não somem.

## Licença

Ao contribuir, você concorda que seu código será licenciado sob MIT (igual ao restante do repositório). Não há CLA.

---

Dúvidas? Abra uma issue ou discussion. Bem-vindo a bordo.
