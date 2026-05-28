# Changelog

Linha do tempo das mudanças do Bagre. Segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org).

Quem está testando o Bagre pode acompanhar aqui o que mudou em cada versão — features adicionadas, removidas, renomeadas, bugs corrigidos.

---

## [Unreleased]

Mudanças que estão em `main` e ainda não entraram em release oficial.

### Adicionado
- **Cloud sync Azure** ([#20](https://github.com/fabgcruz/bagre/issues/20)) — segundo provider cloud implementado, completa a promessa de multi-cloud feita na v0.2.0. Auth via Service Principal (App Registration + client secret + tenant ID + subscription ID), REST puro contra `management.azure.com` (sem SDK pesado). Sincroniza VNets/subnets, Network Interfaces (private IPs) e Public IPs (incluindo unassociated — gold do FinOps). FinOps report e Catálogos dinâmicos passam a incluir Azure automaticamente. Picker do provider na UI agora habilita Azure (saiu do "em breve").
- Sync engine passa `account.scope` como 3º argumento para `listSubnets`/`listIps`. AWS ignora; Azure usa pra montar o path `/subscriptions/{id}/providers/...`.

---

## [0.3.2] — 2026-05-27

**Tema:** Histórico de capacidade — capacity planning fica visual.

Patch release com a visualização temporal do uso de cada subnet. Decisão de "preciso pedir mais um /24" deixa de ser intuição e passa a ter tendência mensurável.

### Adicionado
- **Histórico temporal de utilização de subnet** ([#11](https://github.com/fabgcruz/bagre/issues/11)) — gráfico SVG inline na página de detalhes da subnet mostrando IPs em uso ao longo do tempo (7d / 30d / 90d). Indicador de tendência (subindo / estável / descendo), linha tracejada da capacidade total como referência, tooltip em cada ponto. Botão "Capturar agora" pra forçar snapshot fora do ciclo do scheduler.
- Schema novo: `SubnetUtilizationSnapshot` (subnetId, takenAt, ipCount, usedCount, reservedCount, freeCount) com índice em (subnetId, takenAt).
- Scheduler periódico em `apps/api/src/integrations/utilization-snapshot.js` — roda a cada `SNAPSHOT_INTERVAL_MINUTES` (default 60), pula subnets com snapshot recente e subnets sem IPs.
- Endpoints: `GET /api/subnets/:id/utilization-history?days=N` (max 365d) e `POST /api/subnets/:id/utilization-snapshot` (admin pode forçar manual).

### Notas
- Gráfico é renderizado em SVG inline puro — zero dependência nova (sem chart lib).
- Snapshots novos começam a aparecer logo após o upgrade. Como histórico é construído por captura, leva ~7 dias rodando pra ver tendência real de uma semana.
- Retention policy ainda não implementada — para uso em larga escala (10k+ subnets) considerar adicionar limpeza periódica em uma release futura.

---

## [0.3.1] — 2026-05-27

**Tema:** Calculadora CIDR avançada e operações em lote.

Patch release focada em melhorar a experiência operacional diária sem breaking changes.

### Adicionado
- **Operações em lote na lista de IPs** ([#14](https://github.com/fabgcruz/bagre/issues/14)) — checkboxes por linha + master checkbox no header + barra de ação flutuante quando ≥1 selecionado. Três ações: Reservar (status RESERVED), Liberar (limpa hostname/tipo/função/notas/device, status FREE) e Editar campos em massa (modal com tipo/função/notas). Endpoint `POST /api/ips/bulk` admin-gated, cap de 500 IPs por chamada. Status é auto-promovido pra USED se algum campo é preenchido em IPs FREE.
- **Calculadora CIDR avançada** ([#12](https://github.com/fabgcruz/bagre/issues/12)) — página `/cidr` agora tem 4 tabs: **Análise** (parse com detecção de overlap no IPAM e match de master range), **Dividir** (quebra um CIDR em N subnets menores, marcando quais já estão em uso), **Próximas livres** (sugere subnets disponíveis dentro de um parent), **Supernet** (acha o menor CIDR que cobre vários inputs).
- Endpoints REST novos: `GET /api/cidr/parse`, `POST /api/cidr/split`, `POST /api/cidr/merge`, `GET /api/cidr/next-free`. Todos exigem auth.

### Infra
- Workflow `docker-publish.yml` agora faz skip elegante quando os secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` não estão configurados — sem mais runs vermelhos. Quando os secrets forem configurados, a próxima release publica automaticamente.

---

## [0.3.0] — 2026-05-27

**Tema:** Prometheus discovery, hardening de segurança e response à comunidade.

Release que responde aos primeiros feedbacks do lançamento no LinkedIn e endurece os defaults de segurança que estavam frouxos na v0.2.0.

### Segurança
- **JWT_SECRET é fail-closed.** API recusa boot se a variável estiver vazia, com menos de 32 chars ou contiver os placeholders de exemplo (`please-change`, `change-me`, `dev-secret`). Tokens forjáveis eram risco real em deploys que esqueciam de configurar.
- **Senha de bootstrap admin não tem mais fallback hardcoded** (`admin123`). Se `BOOTSTRAP_ADMIN_PASSWORD` não vier do env, uma senha aleatória forte é gerada no primeiro boot e impressa UMA vez no log do container (anote dali). Se vier mas com <10 chars, boot falha.
- **Defaults removidos do `docker-compose.yml`.** Tokens (`ADMIN_TOKEN`, `INGEST_TOKEN`, `JWT_SECRET`) e senha de admin não têm mais valores padrão inseguros — o operador define no `.env`.
- `.env.example` reescrito com instruções claras de geração de segredos.

### Adicionado
- **Prometheus discovery** ([#25](https://github.com/fabgcruz/bagre/issues/25)) — nova integração que consome `GET /api/v1/targets` do Prometheus, extrai IPs/hostnames dos labels (`__address__`, `instance`, `job`), e empurra para o mesmo pipeline de pending discoveries do Zabbix. Auth `none` / `bearer` / `basic`. Página admin em `/admin/integrations/prometheus`, surface no painel "Integrações". Scheduler periódico configurável.
- Pipeline de discovery extraído pra módulo compartilhado (`apps/api/src/integrations/discovery.js`) — qualquer integração futura (SNMP, Nmap, etc) reutiliza `applyDiscoveries(source, items)`.
- Catálogo de VLANs agora aceita campo `provider` (string livre) — usuário identifica o datacenter/colo (Equinix, Ascenty, ODATA, próprio, etc).
- Audit log: labels para `datacenter_vlan`, `cloud_account`, `zabbix_config`, `prometheus_config`, `oidc_config`.
- **Catálogos → abas dinâmicas por cloud account conectado.** A aba "Azure Subnets" estática saiu; em seu lugar uma aba por CloudAccount ativo, listando subnets sincronizadas em tempo real (com CIDR, region, contagem de IPs e link direto pra subnet no Bagre). Refresh automático a cada 30s.
- Endpoint `GET /api/cloud-accounts/:id/subnets` retornando as subnets sincronizadas de uma conta cloud.

### Documentação / processo
- **CONTRIBUTING.md** novo ([#4](https://github.com/fabgcruz/bagre/issues/4)) — fluxo, convenções, onde achar coisas.
- **SECURITY.md** novo ([#5](https://github.com/fabgcruz/bagre/issues/5)) — política de divulgação privada via GitHub Security Advisories, processo de resposta, boas práticas para operadores.
- **Issue templates** em `.github/ISSUE_TEMPLATE/` ([#6](https://github.com/fabgcruz/bagre/issues/6)) — formulários estruturados para bug e feature, com links contextuais para Discussions e Security Advisories.
- **docs.html regenerada** ([#3](https://github.com/fabgcruz/bagre/issues/3)) — versão navegável dos guias `docs/*.md` em um único HTML.

### Mudado
- **Refactor `EquinixVlan` → `DatacenterVlan`** ([#8](https://github.com/fabgcruz/bagre/issues/8) / [#23](https://github.com/fabgcruz/bagre/issues/23)) — catálogo agora é neutro em relação ao provider de datacenter. Endpoints renomeados de `/api/equinix-vlans` para `/api/datacenter-vlans`, schema model `EquinixVlan` virou `DatacenterVlan` com novo campo `provider`. Importer aceita `datacenter_vlans` (novo) ou `equinix_vlans` (legacy) no seed JSON pra compatibilidade.
- Sidebar reorganizada: "Documentação API" virou item admin (abaixo de Auditoria), "Conexões" voltou a se chamar "Integrações" (agora não confunde porque a doc da API está em seção separada).
- Rota `/integrations` agora exige perfil ADMIN.
- **Hero FinOps refatorado para framing de auditoria, não de "celebração".** Três estados explícitos: sem dados (cinza neutro, CTA pra conectar), zero ociosos (verde com nota pra re-sync), N ociosos (âmbar com "avalie caso a caso — alguns são propositais").
- Sidebar admin agora inclui "Cloud Accounts" entre Integrações e Aprovações.

### Removido
- **Feature de Firewall Rules** — fora do escopo IPAM (NetBox e ferramentas dedicadas fazem isso melhor). Página, rotas, model `FirewallRule`, importer block, item no menu — tudo apagado. Classificação "Firewall" como tipo de equipamento (FortiGate etc) permanece.

### Infra
- `.dockerignore` em `apps/api` e `apps/web` corta context transfer do build (de 24MB pra ~poucos KB), acelera CI.
- Pipeline CI (GitHub Actions): `apps/api` instala + `prisma generate` + syntax check; `apps/web` instala + `vite build` em PRs e push.
- Pipeline de publish: workflow `docker-publish.yml` constrói multi-arch (amd64+arm64) e empurra `bagre-api` + `bagre-web` pro Docker Hub a cada GitHub Release publicada. Requer secrets `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN`.

### Issues fechadas nesta release
#1, #2, #3, #4, #5, #6, #7, #8, #19, #22, #23, #25

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

[Unreleased]: https://github.com/fabgcruz/bagre/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/fabgcruz/bagre/releases/tag/v0.3.2
[0.3.1]: https://github.com/fabgcruz/bagre/releases/tag/v0.3.1
[0.3.0]: https://github.com/fabgcruz/bagre/releases/tag/v0.3.0
[0.2.0]: https://github.com/fabgcruz/bagre/releases/tag/v0.2.0
[0.1.0]: https://github.com/fabgcruz/bagre/commit/5815508
