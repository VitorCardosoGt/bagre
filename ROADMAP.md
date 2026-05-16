# Bagre — Roadmap

> Última atualização: 2026-05-16

Este documento descreve a visão, os princípios e o plano de evolução do
Bagre como projeto opensource. É um documento vivo — abra uma issue ou
discussion se discordar ou tiver sugestão.

---

## Visão

Ser o **IPAM opensource de referência para times cloud-native** —
moderno, focado, opinionado, com integração nativa em IaC e Kubernetes.

Não competimos em "completude" com NetBox. Competimos em **simplicidade**,
**experiência do operador** e **integração com a stack moderna**.

---

## Tese

> O mercado IPAM opensource hoje tem dois extremos: ferramentas antigas
> (phpIPAM, GestióIP) com UX dos anos 2010, ou ferramentas gigantes
> (NetBox) que viraram suíte de DCIM + IPAM + circuits + secrets +
> tenants. **Falta uma terceira opção** — IPAM que faz uma coisa muito
> bem, tem UI atual, e integra nativamente com Terraform, Kubernetes,
> DNS, e clouds públicas.
>
> Bagre é essa terceira opção.

---

## Princípios

São decisões inegociáveis que guiam aceitação de features e PRs:

1. **Simples > completo.** Toda feature precisa justificar sua complexidade.
   Quando em dúvida, não adicionar.

2. **Cloud-native first.** Decisões de arquitetura priorizam integração com
   Kubernetes, IaC (Terraform), cloud providers e padrões modernos (OpenAPI,
   OpenTelemetry, Prometheus).

3. **IPv4 e IPv6 com mesmo peso.** Nada de "IPv6 quando der" — é cidadão de
   primeira desde o schema.

4. **API-first.** Toda funcionalidade da UI tem endpoint REST equivalente
   documentado em OpenAPI.

5. **Auditável por design.** Toda mutação registra autor, timestamp, diff
   antes/depois. Auditoria não é feature opcional.

6. **Onboarding em minutos.** `docker compose up` deve te dar um sistema
   funcional em < 5 minutos.

7. **Sem dependência de SaaS proprietário.** Bagre roda 100% on-prem,
   air-gapped se quiser. Integrações com serviços externos são opcionais.

---

## Não-objetivos

Pra ficar claro o que Bagre **não** vai ser:

- ❌ **DCIM** (gestão de rack/cabling/inventário físico) — esse é o terreno do
  NetBox, e tudo bem
- ❌ **DNS server** primário — integra com PowerDNS/BIND/Route53, não substitui
- ❌ **DHCP server** primário — integra com Kea, ISC, dnsmasq
- ❌ **NIPAP-style RIR integration** complexa (ARIN/RIPE/LACNIC API) — pode vir
  como plugin, não é core
- ❌ **CRM/billing de IPs** para ISPs — escopo fora
- ❌ **Multi-tenancy enterprise complexa** (orgs, billing, white-label) — pode vir
  como módulo separado se demanda existir
- ❌ **GUI ultra-customizável** (themes, layouts, dashboards drag-drop) — UI é
  opinionada e consistente

---

## Fases

Cadência alvo: **1 release minor por mês**, **1 feature do Tier 2 por trimestre**.
Datas são intenções, não promessas — projeto opensource solo.

### Phase 0 — Foundation (Q2 2026, em andamento)

Sair do MVP para "instalável e útil em produção pequena":

- ✅ Fork para opensource MIT (`fabgcruz/bagre`)
- ✅ Branding (logo, tagline, identidade)
- 🔲 [#1](https://github.com/fabgcruz/bagre/issues/1) Validar build pós-cleanup
- 🔲 [#2](https://github.com/fabgcruz/bagre/issues/2) Regerar lockfiles
- 🔲 [#3](https://github.com/fabgcruz/bagre/issues/3) Regerar docs.html
- 🔲 [#4](https://github.com/fabgcruz/bagre/issues/4) CONTRIBUTING.md
- 🔲 [#5](https://github.com/fabgcruz/bagre/issues/5) SECURITY.md
- 🔲 [#6](https://github.com/fabgcruz/bagre/issues/6) Issue templates
- 🔲 [#7](https://github.com/fabgcruz/bagre/issues/7) GitHub Actions CI
- 🔲 [#8](https://github.com/fabgcruz/bagre/issues/8) Refactor EquinixVlan
- 🔲 [#9](https://github.com/fabgcruz/bagre/issues/9) Screenshots no README

**Saída desta fase**: Bagre 0.2.0 — "instalável, documentado, contribuível".

### Phase 1 — Core IPAM (Q3 2026)

Levar o produto-core ao nível de paridade com phpIPAM e à frente em UX:

- 🔲 [#10](https://github.com/fabgcruz/bagre/issues/10) IPv6 first-class
- 🔲 [#11](https://github.com/fabgcruz/bagre/issues/11) Histórico de utilização
- 🔲 [#12](https://github.com/fabgcruz/bagre/issues/12) Calculadora CIDR avançada
- 🔲 [#13](https://github.com/fabgcruz/bagre/issues/13) Importação universal
- 🔲 [#14](https://github.com/fabgcruz/bagre/issues/14) Bulk operations

**Saída desta fase**: Bagre 0.5.0 — "core IPAM completo, moderno, com IPv6".

### Phase 2 — Cloud-native (Q4 2026)

Posicionar o Bagre como first-class citizen na stack moderna:

- 🔲 [#15](https://github.com/fabgcruz/bagre/issues/15) Terraform Provider
- 🔲 [#16](https://github.com/fabgcruz/bagre/issues/16) Kubernetes Operator + CRDs
- 🔲 [#17](https://github.com/fabgcruz/bagre/issues/17) DNS integration (PowerDNS primeiro)

**Saída desta fase**: Bagre 0.8.0 — "consumível por Terraform/K8s/DNS".

### Phase 3 — Polish & Production (Q1 2027)

Refinos para uso em produção corporativa:

- Approval workflow (requisição → aprovação → alocação)
- API tokens com scope (read-only, per-site, per-range)
- i18n (PT-BR + EN + ES no minimum)
- Dark mode
- OpenTelemetry tracing nativo
- Cloud sync — AWS VPC + Azure VNet
- Tagging system com RBAC por tag

**Saída desta fase**: **Bagre 1.0.0** — recomendado para produção.

### Phase 4+ — Ecosystem (Q2 2027 em diante)

Expansão guiada por comunidade:

- DHCP integration (Kea, ISC, dnsmasq)
- Discovery via SNMP/scanners (avança o ingest atual)
- GitOps mode — ranges em YAML no Git, Bagre reconcilia
- Webhooks + notificações (Slack, Teams, Discord)
- OPA/Rego policy engine
- Plugin system para extensões em JS
- Federation — múltiplos Bagres comunicando
- Network topology graph
- Mais providers DNS (Cloudflare, Azure DNS, TechnitiumDNS)
- Mais providers cloud (GCP, Hetzner, DigitalOcean)

---

## Versionamento

Seguimos **Semantic Versioning** ([semver.org](https://semver.org)):

- `0.x.y` (atual) — API instável, breaking changes possíveis entre minors
- `1.0.0` — primeira versão estável, compromisso de backwards-compat
- `1.x.y` — features novas em minors, bugfixes em patches
- `2.0.0+` — só com mudança incompatível justificada

---

## Como influenciar o roadmap

- **Issues** — descreva o problema, não a solução. "Preciso de X porque Y" é
  melhor que "implementem feature Z"
- **Discussions** — para ideias maiores ou perguntas abertas
- **PRs** — features menores podem vir direto via PR; features grandes melhor
  discutir em issue antes
- **+1 em issues existentes** — sinaliza prioridade

---

## Outras formas de contribuir (não-código)

- Traduzir UI ou docs
- Escrever blog post sobre seu uso
- Criar Helm chart, Ansible role, Terraform module
- Reportar bugs com reprodução clara
- Revisar PRs de terceiros
- Responder dúvidas em Discussions

Toda contribuição é creditada em `CONTRIBUTORS.md` (a criar).
