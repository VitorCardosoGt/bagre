# Changelog

Linha do tempo das mudanças do Bagre. Segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org).

Quem está testando o Bagre pode acompanhar aqui o que mudou em cada versão — features adicionadas, removidas, renomeadas, bugs corrigidos.

---

## [Unreleased]

Mudanças que estão em `main` e ainda não entraram em release oficial.

### Segurança
- **JWT_SECRET é fail-closed.** API recusa boot se a variável estiver vazia, com menos de 32 chars ou contiver os placeholders de exemplo (`please-change`, `change-me`, `dev-secret`). Tokens forjáveis eram risco real em deploys que esqueciam de configurar.
- **Senha de bootstrap admin não tem mais fallback hardcoded** (`admin123`). Se `BOOTSTRAP_ADMIN_PASSWORD` não vier do env, uma senha aleatória forte é gerada no primeiro boot e impressa UMA vez no log do container (anote dali). Se vier mas com <10 chars, boot falha.
- **Defaults removidos do `docker-compose.yml`.** Tokens (`ADMIN_TOKEN`, `INGEST_TOKEN`, `JWT_SECRET`) e senha de admin não têm mais valores padrão inseguros — o operador define no `.env`.
- `.env.example` reescrito com instruções claras de geração de segredos.

### Adicionado
- Catálogo de VLANs agora aceita campo `provider` (string livre) — usuário identifica o datacenter/colo (Equinix, Ascenty, ODATA, próprio, etc).
- Audit log: labels para `datacenter_vlan` e `cloud_account`.
- **Catálogos → abas dinâmicas por cloud account conectado.** A aba "Azure Subnets" estática saiu; em seu lugar uma aba por CloudAccount ativo, listando subnets sincronizadas em tempo real (com CIDR, region, contagem de IPs e link direto pra subnet no Bagre). Refresh automático a cada 30s.
- Endpoint `GET /api/cloud-accounts/:id/subnets` retornando as subnets sincronizadas de uma conta cloud.

### Documentação / processo
- **CONTRIBUTING.md** novo (#4) — fluxo, convenções, onde achar coisas.
- **SECURITY.md** novo (#5) — política de divulgação privada via GitHub Security Advisories, processo de resposta, boas práticas para operadores.
- **Issue templates** em `.github/ISSUE_TEMPLATE/` (#6) — formulários estruturados para bug e feature, com links contextuais para Discussions e Security Advisories.
- **docs.html regenerada** (#3) — versão navegável dos guias `docs/*.md` em um único HTML.

### Mudado
- **Refactor `EquinixVlan` → `DatacenterVlan`** — o catálogo agora é neutro em relação ao provider de datacenter. Endpoints renomeados de `/api/equinix-vlans` para `/api/datacenter-vlans`, schema model `EquinixVlan` virou `DatacenterVlan` com novo campo `provider`. Importer aceita `datacenter_vlans` (novo) ou `equinix_vlans` (legacy) no seed JSON pra compatibilidade. ([#23](https://github.com/fabgcruz/bagre/issues/23))
- Sidebar reorganizada: "Documentação API" virou item admin (abaixo de Auditoria), "Conexões" voltou a se chamar "Integrações" (agora não confunde porque a doc da API está em seção separada).
- Rota `/integrations` agora exige perfil ADMIN.

### Infra
- `.dockerignore` em `apps/api` e `apps/web` corta context transfer do build (de 24MB pra ~poucos KB), acelera CI.
- Pipeline CI (GitHub Actions): `apps/api` instala + `prisma generate` + syntax check; `apps/web` instala + `vite build` em PRs e push.
- Pipeline de publish: workflow `docker-publish.yml` constrói multi-arch (amd64+arm64) e empurra `bagre-api` + `bagre-web` pro Docker Hub a cada GitHub Release publicada. Requer secrets `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN`.

---

## [0.2.0] — 2026-05-27

**Tema:** Cloud sync (AWS) + FinOps idle public IPs.

Primeira entrega significativa pós-lançamento. O Bagre passa a conectar contas cloud e mostrar IPs públicos ociosos sangrando custo.

### Adicionado
- **Cloud Accounts (AWS)** — nova página admin em `/admin/cloud-accounts`. Conecta conta AWS via Access Key (IAM User) ou Assume Role (STS). Sincroniza VPCs, subnets, ENIs e Elastic IPs.
- **Modos de auth AWS**: `ACCESS_KEY` (IAM User read-only) e `ASSUME_ROLE` (STS:AssumeRole com external ID opcional).
- **FinOps — IPs públicos ociosos**: endpoint `GET /api/cloud/finops/idle-public-ips` + UI hero card com USD/mês estimado + drill-down table. Atualiza a cada 30s.
- **Pool sintético de Public IPs** — Elastic IPs unassociated agora têm bucket dedicado (`<provider>-public-pool`), base do FinOps.
- **Per-account site sintético** (`cloud-<provider>-<accountId>`) isolando múltiplas contas do mesmo provider.
- Schema: models `CloudAccount`, `CloudSyncRun`; enums `IpKind`, `CloudProvider`, `CloudSyncMode`, `CloudSyncStatus`. `Subnet` e `IpAddress` ganham campos opcionais de tracking cloud (`source`, `cloudAccountId`, `cloudResourceId`, `cloudMetadata`, `ipKind`).
- Encryption AES-256-GCM pra credenciais cloud no DB (módulo `integrations/cloud/crypto.js`). Requer `CLOUD_CREDS_KEY` no `.env`.
- Mascote do Bagre (catfish com boné "BAGRE") como ícone do app + favicon. Branding único em todas as telas (login, signup, reset, sidebar).
- Badges no README: release, CI, license, stars, issues, contributors, last commit, PRs welcome.
- Wiki básica em `docs/` com tutoriais (instalação, uso diário, integrações, API REST, operação).

### Removido
- **Feature de Firewall Rules** — fora do escopo de IPAM. Página, rotas, model `FirewallRule`, importer block, link no menu — tudo removido. Classificação "Firewall" como tipo de equipamento (FortiGate etc) permanece, é coisa diferente.

### Corrigido
- `docker compose up -d` agora funciona em clone fresh (antes nginx crash-loopava sem certs TLS, e a API explodia tentando ler `seed.json` inexistente como diretório).
- README ajustado pra URL real do repo (não `SEU-USUARIO`).
- Renomeado `CLAUDE.md` → `AGENTS.md` (convenção neutra; remove qualquer referência a ferramenta específica).
- Removidas todas as referências a "Duosystem" (legacy do fork de origem) em código, docs, seeds, branding e mensagens de commit. Histórico reescrito pra zerar traços.

---

## [0.1.0] — 2026-05-16

Versão inicial publicada após o fork pra opensource.

### Adicionado
- Stack core: Node.js 20 + Fastify + Prisma + PostgreSQL 15 + React + Vite + Tailwind, orquestrado por Docker Compose.
- Catálogo central de sites, subnets (CIDR) e endereços IP.
- Alocação manual ou automática de IPs respeitando o range da subnet.
- Importação de inventários em XLSX/CSV.
- Trilha de auditoria com diff antes/depois.
- Login local + SSO via OIDC (Microsoft Entra ID, Keycloak).
- RBAC com perfis ADMIN/READER.
- Integração com Zabbix para descoberta automática de hosts (puxa MAC, OS, vendor, model).
- Endpoint `/metrics` em formato Prometheus.
- API REST documentada.
- Wiki integrada opcional via DokuWiki.
- ROADMAP público com 4 fases até a 1.0.0.

[Unreleased]: https://github.com/fabgcruz/bagre/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fabgcruz/bagre/releases/tag/v0.2.0
[0.1.0]: https://github.com/fabgcruz/bagre/commit/5815508
