# Política de segurança

## Versões suportadas

O Bagre está em **1.x**. A **última release** recebe correções de segurança.

| Versão | Suporte |
|---|---|
| 1.0.x | ✅ Recebe patches de segurança |
| 0.x | ❌ Atualize para 1.0.x |

Conforme novas versões saírem, mantemos sempre a release mais recente com patches. Vulnerabilidades em versões antigas se resolvem atualizando para a última.

## Reportando uma vulnerabilidade

**NÃO abra uma issue pública** para reportar vulnerabilidade. Issues no GitHub são indexadas e ficam visíveis antes de qualquer correção.

### Canal preferido — GitHub Security Advisories

Vá em https://github.com/fabgcruz/bagre/security/advisories/new e descreva:

- **Descrição** do problema e impacto (em uma frase)
- **Reprodução** passo a passo, incluindo versão afetada e configuração mínima
- **Sugestão de fix** se você tiver alguma
- **Atribuição** desejada (créditos no advisory público depois do fix)

Eu (mantenedor) recebo notificação privada e respondo em até **72 horas** confirmando recebimento.

### Canal alternativo

Se preferir, abra um issue rascunho público pedindo um canal privado (sem detalhes da vuln) e eu mando contato direto.

## Processo de resposta

1. **Confirmação em até 72h** — você recebe ack do recebimento.
2. **Análise em até 7 dias** — confirmamos a vuln, definimos severidade (CVSS) e timeline.
3. **Correção** — patch é desenvolvido em branch privado.
4. **Disclosure coordenado** — fix é mergeado, release publicada, advisory público com seu crédito (se aceito).

Tempo total típico até fix público: **7 a 14 dias** para vulns críticas, **30 dias** para média.

## Escopo da política

Coberto:
- Código do repositório `fabgcruz/bagre` (apps/api, apps/web, scripts, infra)
- Configurações padrão dos containers
- Endpoints da API REST

Fora de escopo (mas ainda interessa saber):
- Vulnerabilidades em dependências de terceiros — reporte upstream e nos avise pra atualizarmos
- Configurações inseguras em deploys específicos (responsabilidade do operador)
- Bugs sem implicação de segurança — abra issue pública normal

## Boas práticas para operadores

Pra reduzir superfície de ataque ao rodar o Bagre:

- **JWT_SECRET ≥48 chars aleatórios** — gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. A API recusa boot sem isso (fail-closed).
- **BOOTSTRAP_ADMIN_PASSWORD** — deixe vazio no primeiro boot para o Bagre gerar randômica e imprimir UMA vez no log; OU defina manualmente ≥10 chars. Nunca use `admin123`.
- **CLOUD_CREDS_KEY** (se usar cloud sync) — 32 bytes hex únicos por deploy. Não compartilhe entre ambientes.
- **TLS na frente** — coloque o Bagre atrás de um reverse proxy com cert válido. HTTP nu só pra dev.
- **RBAC** — use o perfil READER para usuários que só consultam.
- **Auditoria** — todas as mutações ficam em `AuditLog` com diff antes/depois. Cheque periodicamente.
- **Não exponha o Bagre direto na internet sem WAF / SSO** — se possível ligue OIDC.
