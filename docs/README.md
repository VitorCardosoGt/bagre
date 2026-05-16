# Documentação · Bagre

Documentação completa do **Bagre** — sistema web de gestão de
endereçamento IP que substitui a planilha histórica de controle de IPs por
uma aplicação multiusuário com auditoria, integrações e API.

> **Autor**: Fabricio Cruz
> **Versão da documentação**: 2026-05
> **Status**: produção · em uso interno

---

## 📖 Índice

1. **[Arquitetura](./01-arquitetura.md)** — Visão técnica: stack, contêineres, modelo de dados, segurança
2. **[Instalação](./02-instalacao.md)** — Subir o ambiente, variáveis, primeiro login
3. **[Uso diário](./03-uso-diario.md)** — Navegar pela UI, editar IPs, busca global, calculadora CIDR
4. **[Administração](./04-administracao.md)** — Usuários, perfis, criação de sites/subnets, importação
5. **[Integrações](./05-integracoes.md)** — Zabbix, SSO/Entra ID, ingestão externa, OTEL/Prometheus
6. **[API REST](./06-api-rest.md)** — Todos os endpoints com exemplos `curl`
7. **[Operação](./07-operacao.md)** — Backup, troubleshoot, métricas, atualização, logs
8. **[Desenvolvimento](./08-desenvolvimento.md)** — Estrutura de código, dev local, build, scripts

---

## 🎯 O que é IPAM?

**IPAM** = *IP Address Management* — sistema que organiza e controla quais
endereços IP existem na rede, quem está usando cada um e para quê.

Substitui a clássica planilha de Excel mantida por equipes de infraestrutura,
com vantagens decisivas:

| Planilha | Bagre |
|---|---|
| Edição por uma pessoa por vez | Multiusuário com auditoria |
| Sem histórico de quem mudou | Trilha completa antes/depois |
| Erros de digitação passam batido | Validação de IP/CIDR |
| Busca complexa de "onde está esse IP?" | Busca global indexada |
| Atualização manual | API recebe dados de scanners (Zabbix, nmap, OTEL) |
| Sem permissões | ADMIN ↔ READER |

---

## 🌟 Principais funcionalidades

### Gestão de endereçamento
- Sites (localizações), subnets (com CIDR), IPs (com tipo, hostname, função, MAC, OS)
- Geração automática de IPs ao criar uma subnet (até 4096)
- Status: livre, em uso, reservado, conflito
- Edição inline por célula
- Bulk operations via API

### Visibilidade
- Dashboard com utilização global e por site
- Calculadora CIDR integrada
- Busca global ⌘K (IP, hostname, subnet, função)

### Segurança e governança
- Perfis ADMIN / READER (RBAC)
- Auditoria com diff antes/depois para qualquer alteração
- SSO via Microsoft Entra ID (OIDC) configurável pela UI
- Login local sempre disponível como fallback

### Integrações
- **Zabbix** (sync periódico): enriquece IPs com tipo, OS, MAC, vendor
- **API de ingestão** para scanners externos (nmap, OTEL collectors)
- **Métricas Prometheus** em `/metrics`
- **Reimportação** da planilha original sob demanda

### Saúde da rede
- IPs stale (marcados como em uso mas sem responder há > N dias)
- IPs fantasmas (vivos na rede mas não cadastrados)
- Conflitos detectados

---

## ⚡ Quick start

A partir do diretório raiz do projeto:

```bash
cp .env.example .env
docker compose up -d --build
```

Aguarde ~30 segundos e abra http://localhost:3000.

Login: `admin@bagre.local` / `admin123`

Próximo passo recomendado: leia a [Instalação](./02-instalacao.md) para detalhes
de configuração e ambiente.

---

## 🛠 Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend | React 18 + Vite + TailwindCSS | Bundle leve, HMR rápido, design clean |
| Estado | TanStack Query (React Query) | Cache automático, sincronização com servidor |
| Backend | Node.js 20 + Fastify | 2-3× mais rápido que Express, validação nativa |
| ORM | Prisma | Schema declarativo, migrations versionadas, type-safety |
| Banco | PostgreSQL 16 | Maturidade, JSON nativo, índices avançados |
| Auth | JWT (`@fastify/jwt`) + bcryptjs | Stateless, padrão de mercado |
| SSO | OIDC via `openid-client` | Funciona com Entra ID, Auth0, Keycloak, etc. |
| Métricas | `prom-client` | Padrão Prometheus, dashboards Grafana prontos |
| Infra | Docker Compose | Reprodutível em qualquer ambiente |
| Reverse proxy | nginx (Alpine) | Serve build estático + proxy `/api` |

Detalhes em [Arquitetura](./01-arquitetura.md).

---

## ❓ Suporte

- Problemas/bugs: registrar via canal interno da Bagre
- Mudanças/PRs: seguir o guia em [Desenvolvimento](./08-desenvolvimento.md)
- Histórico de alterações: tela `/admin/audit` na aplicação

---

© Bagre · Sistema desenvolvido por **Fabricio Cruz**
