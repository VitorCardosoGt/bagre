# Bagre

**Open Source IP Address Management**

Uma solução leve e poderosa para gerenciar, organizar e monitorar todos os
IPs da sua rede — de ambientes simples até infraestruturas híbridas complexas.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Por que Bagre?

O bagre é um peixe que vive nas águas turvas e se orienta pelos bigodes
sensíveis, detectando tudo ao seu redor. O Bagre IPAM segue a mesma lógica:

- **Enxerga** o que está oculto na rede
- **Detecta** mudanças e oportunidades (IPs disponíveis, hosts fantasmas, ranges fragmentados)
- **Funciona** em diferentes ambientes e infraestruturas
- **Silencioso, resistente e eficiente**
- **Mantém tudo organizado e sob controle**

## O que o Bagre faz

- Catálogo central de sites, sub-redes (CIDR) e endereços IP com auditoria completa
- Alocação manual ou automática de IPs respeitando o range da sub-rede
- Importação de inventários existentes (XLSX/CSV)
- **Cloud sync (AWS)** — conecta sua conta AWS via Access Key ou Assume Role, sincroniza VPCs/subnets/ENIs/Elastic IPs e mostra IPs públicos ociosos sangrando custo (relatório FinOps). Azure e GCP no roadmap.
- API REST para integração com ferramentas de descoberta (Zabbix, scanners de rede, OTEL)
- Login local + SSO via OIDC (Microsoft Entra ID, Keycloak, qualquer provider compatível)
- RBAC com perfis ADMIN/READER e wiki integrada via DokuWiki
- Métricas Prometheus em `/metrics`
- Trilha de auditoria com diff antes/depois de toda alteração

## Stack

- **Backend**: Node.js 20 + Fastify + Prisma + PostgreSQL 15
- **Frontend**: React + Vite + Tailwind CSS
- **Orquestração**: Docker Compose
- **Opcional**: DokuWiki para documentação operacional, Zabbix para descoberta automática

## Quickstart

Requisitos: Docker + Docker Compose plugin.

```bash
git clone https://github.com/fabgcruz/bagre.git
cd bagre

cp .env.example .env
# editar .env e definir ADMIN_TOKEN, JWT_SECRET, BOOTSTRAP_ADMIN_EMAIL/PASSWORD

docker compose up -d
```

Abra http://localhost:3000 e faça login com o e-mail/senha definidos no `.env`.

| Componente | URL |
|---|---|
| Web UI | http://localhost:3000 |
| API REST | http://localhost:3001 |
| Métricas Prometheus | http://localhost:3001/metrics |
| Health check | http://localhost:3001/api/health |

## Documentação

A pasta [`docs/`](docs/) contém guias detalhados:

- [`01-arquitetura.md`](docs/01-arquitetura.md) — Stack, modelo de dados, decisões
- [`02-instalacao.md`](docs/02-instalacao.md) — Subir do zero, requisitos
- [`03-uso-diario.md`](docs/03-uso-diario.md) — Operação pelo usuário final
- [`04-administracao.md`](docs/04-administracao.md) — Usuários, perfis, RBAC
- [`05-integracoes.md`](docs/05-integracoes.md) — Zabbix, OIDC, Prometheus
- [`06-api-rest.md`](docs/06-api-rest.md) — Endpoints com exemplos `curl`
- [`07-operacao.md`](docs/07-operacao.md) — Backup, restore, troubleshooting
- [`08-desenvolvimento.md`](docs/08-desenvolvimento.md) — Dev local, contribuir

## Contribuindo

Pull requests e issues são bem-vindos. Antes de mandar um PR:

1. Abra uma issue descrevendo a mudança proposta (especialmente para features grandes)
2. Para bugs, inclua passos para reproduzir e ambiente (versão Docker, OS, etc.)
3. Mantenha o estilo de código existente
4. Adicione testes quando aplicável

Detalhes em `CONTRIBUTING.md` (em construção).

## Licença

[MIT](LICENSE) — use, modifique, redistribua. Atribuição é apreciada mas não exigida.

## Status do projeto

Bagre é jovem e evoluindo. Considere produção a partir da versão `1.0.0` (ainda não lançada).
Hoje serve bem para laboratórios, ambientes internos e times pequenos.

---

> Bagre — IPAM que enxerga nas águas turvas da sua rede.
