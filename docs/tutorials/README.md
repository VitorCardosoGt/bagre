# Tutoriais do Bagre

Tutoriais passo-a-passo gerados via Playwright contra uma instância real do Bagre. Cada tutorial captura screenshots automaticamente e monta o markdown com narrativa + imagens.

## Como gerar

```bash
# 1. Stack rodando
docker compose up -d

# 2. Playwright instalado (uma vez)
cd apps/web && npm i -D playwright && npx playwright install chromium && cd -

# 3. Gera todos os tutoriais
node scripts/generate-tutorial-screenshots.mjs

# OU gera só um específico
node scripts/generate-tutorial-screenshots.mjs quickstart
```

Os tutoriais gerados ficam em `docs/tutorials/<id>/README.md` com `screenshots/` ao lado.

## Tutoriais disponíveis

| ID | Cobertura |
|---|---|
| `quickstart` | Login → dashboard → sites → calculadora CIDR |
| `connect-aws` | Conectar conta AWS, IAM policy, FinOps idle public IPs |
| `cidr` | Calculadora CIDR avançada — análise, dividir, próximas livres |

## Por que Playwright em vez de prints manuais?

- **Sempre atualizado** — quando a UI muda, rode o script de novo e os prints + markdown se atualizam.
- **Sem trabalho manual de annotation** — o script faz o flow e captura.
- **CI-friendly** — pode rodar em `.github/workflows/docs.yml` periodicamente.

## Variáveis de ambiente

| Var | Default | O que controla |
|---|---|---|
| `BAGRE_URL` | `http://localhost:3000` | URL base da instância |
| `BAGRE_EMAIL` | `admin@bagre.local` | usuário de login |
| `BAGRE_PASSWORD` | `admin123` | senha (use a do `.env` se mudou) |

## Adicionar um tutorial novo

Edite `scripts/generate-tutorial-screenshots.mjs` e adicione uma entrada no objeto `tutorials`:

```js
'meu-novo-tutorial': {
  title: 'Título descritivo',
  steps: [
    {
      name: '01-primeiro-step',
      narrative: 'Markdown que vai ao lado da screenshot.',
      async action(page) {
        await page.goto(`${URL_BASE}/alguma-rota`);
        // qualquer interação Playwright
      },
    },
    // ...
  ],
}
```

Cada `action(page)` recebe a `page` do Playwright e faz a navegação/cliques. A screenshot é capturada após retorno do `action`.

## Estado atual

Esta primeira versão do gerador (#24) entrega:
- Script base com 3 tutoriais
- Estrutura de output em `docs/tutorials/<id>/`
- Documentação de como rodar e estender

Próximas iterações:
- Tutoriais para Prometheus discovery, DNS sync, bulk ops, histórico de capacidade
- Workflow GitHub Actions que regenera periodicamente (precisa de stack ephemeral em CI)
- Geração de PDF/site estático a partir dos markdowns (MkDocs Material)
