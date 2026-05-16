# data/

Esta pasta é o ponto de entrada opcional para importação de dados existentes
no Bagre — por exemplo, uma planilha XLSX legada com inventário de IPs.

## Formato esperado

Uma planilha XLSX com pelo menos uma aba contendo as colunas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `site` | texto | sim | Nome do site/localização |
| `subnet` | CIDR (ex: `10.0.0.0/24`) | sim | Sub-rede a que o IP pertence |
| `ip` | IPv4 | sim | Endereço IP |
| `hostname` | texto | não | Nome do host |
| `descricao` | texto | não | Observações livres |
| `responsavel` | texto | não | Pessoa/time dono |

Veja exemplos em `docs/02-instalacao.md`.

## Importar

```bash
cd apps/api
npm run import
```

O script `apps/api/src/import.js` lê todas as `.xlsx` em `data/` e popula o
Postgres via Prisma. É **idempotente**: rodar de novo com uma versão atualizada
do mesmo arquivo faz upsert, não duplica.

## Privacidade

Arquivos `.xlsx` e `.xlsm` ficam **fora do git** por padrão (ver `.gitignore`).
Se você forka este projeto e quer commitar uma planilha de exemplo, use dados
sintéticos (IPs RFC 1918 e nomes fakes) — nunca topologia real.
