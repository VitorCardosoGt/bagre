# Instalação

> Como subir o ambiente do zero, configurar e fazer o primeiro login.
> **Autor**: Fabricio Cruz

---

## Pré-requisitos

| Item | Versão mínima | Como verificar |
|---|---|---|
| Docker | 27.x | `docker --version` |
| Docker Compose v2 | 2.30+ | `docker compose version` |
| Memória disponível | 4 GB | Docker Desktop / Colima `--memory 4` |
| Porta livre 3000 | (web) | `lsof -i :3000` |
| Porta livre 3001 | (api) | `lsof -i :3001` |
| Porta livre 5433 | (db) | `lsof -i :5433` |

> Em macOS sem Docker Desktop, usar **Colima**:
> `brew install colima docker docker-compose`
> `colima start --cpu 2 --memory 4 --disk 30`
> `mkdir -p ~/.docker/cli-plugins && ln -sf /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose`

---

## Subida básica (3 passos)

```bash
# 1. Clone/acesse o repositório
cd /Users/fabricio/Documents/code/bagre

# 2. Crie o .env a partir do exemplo
cp .env.example .env

# 3. Suba a stack
docker compose up -d --build
```

Aguarde ~30 segundos. Verifique com:

```bash
docker compose ps
# 3 contêineres devem estar Up: bagre-{db,api,web}

curl -s http://localhost:3001/api/health
# {"ok":true,"ts":"..."}
```

Abra **http://localhost:3000** no navegador.

---

## Variáveis de ambiente (`.env`)

| Variável | Default | Descrição |
|---|---|---|
| `ADMIN_TOKEN` | `change-me` | Token para reimportação via API (`POST /api/import/seed`) |
| `INGEST_TOKEN` | `change-me-ingest` | Token para integrações externas (scanners, OTEL) |
| `JWT_SECRET` | `please-change-this-secret-32-chars-min` | Assinatura de tokens JWT — **mude em produção** |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@bagre.local` | Email do admin criado no primeiro boot |
| `BOOTSTRAP_ADMIN_PASSWORD` | `admin123` | Senha inicial do admin (forçada a trocar) |

> ⚠ **Em produção**, gere um `JWT_SECRET` aleatório com no mínimo 32 caracteres
> e tokens únicos para `ADMIN_TOKEN` e `INGEST_TOKEN`.
>
> ```bash
> openssl rand -base64 48
> ```

---

## Primeiro login

1. Abra http://localhost:3000
2. Email: `admin@bagre.local`
3. Senha: `admin123` (ou o valor de `BOOTSTRAP_ADMIN_PASSWORD`)
4. O sistema **força a troca de senha** no primeiro login
5. Defina uma senha nova (mínimo 8 caracteres)
6. Pronto — você está logado como ADMIN

---

## Importação inicial da planilha

Coloque uma planilha em `data/*.xlsx` (formato esperado documentado em
`docs/08-desenvolvimento.md`) e ela é importada **automaticamente** no
primeiro boot, **se o banco estiver vazio**.

A importação cria, conforme o conteúdo da planilha:
- Sites (com `code` e `name`)
- Subnets (com CIDR, nome, range)
- IPs (todos os endereços de cada subnet)
- Regras de Firewall (opcional)
- VLANs e mapeamentos de cloud (opcional)
- 146 Master Ranges
- 32 entradas de referência CIDR

### Reimportação manual

Se a planilha for atualizada, reimporte assim:

```bash
# 1. Regere o seed.json a partir do xlsx (requer Python + openpyxl)
python3 scripts/extract_xlsx.py
# Output: scripts/seed.json

# 2. Force a importação (idempotente, faz upsert)
docker compose exec api node src/import.js /app/seed.json
```

> O importador é **idempotente**: atualiza linhas existentes e cria novas
> sem apagar dados manuais. Mas atenção: se a planilha tiver um valor
> "errado" para um IP, ele sobrescreverá o valor atual no DB. Para preservar
> dados manuais, use o `--if-empty` flag (que só importa se o DB estiver vazio).

### Reimportação via API (sem precisar entrar no contêiner)

```bash
curl -X POST http://localhost:3001/api/import/seed \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

---

## Subindo o overlay de teste do Zabbix

Para testar a integração com Zabbix sem precisar conectar a um Zabbix real,
use o overlay incluso:

```bash
# Sobe Zabbix server + web + DB ao lado do IPAM
docker compose -f docker-compose.yml -f docker-compose.zabbix-dev.yml up -d

# Aguarde ~60 segundos para o Zabbix inicializar

# Popule hosts fictícios com inventário rico (OS, MAC, vendor)
node scripts/seed-zabbix-dev.mjs
```

Depois, no IPAM:
- Acesse `/admin/integrations/zabbix`
- URL: `http://bagre-zabbix-web:8080`
- Usuário: `Admin` · Senha: `zabbix`
- Clique **Testar conexão** → **Salvar** → **Habilitar sincronização**

Detalhes em [Integrações](./05-integracoes.md).

Para parar só o Zabbix dev:

```bash
docker compose -f docker-compose.zabbix-dev.yml down
```

---

## Atualização do sistema

Quando houver mudanças no código (pull de nova versão):

```bash
git pull  # (se usar git)

# Rebuild dos contêineres com cache
docker compose up -d --build api web

# Se mudou o schema Prisma, db push roda automaticamente no boot
docker compose logs api --tail 30
```

> Mudanças destrutivas no schema (DROP TABLE, etc) podem requerer
> `--accept-data-loss`. Faça backup antes (veja [Operação](./07-operacao.md)).

---

## Desinstalação completa

```bash
# Para tudo (mantém volume do DB)
docker compose down

# Remove tudo INCLUSIVE volume (apaga o banco)
docker compose down -v

# Remove imagens construídas
docker rmi bagre-api bagre-web

# Para o overlay do Zabbix dev se estiver rodando
docker compose -f docker-compose.zabbix-dev.yml down -v
```

---

## Troubleshooting

### Containers reiniciando em loop

```bash
docker compose logs api --tail 50
```

Causas comuns:
- `db` não está saudável ainda (aguarde 30s)
- `JWT_SECRET` muito curto (mínimo 32 chars)
- Porta 3001 já ocupada → mudar em `docker-compose.yml`

### "Could not parse schema engine response"

Isso significa Prisma com problema de OpenSSL. O Dockerfile usa
`debian-bookworm-slim` justamente para resolver. Se aparecer:

```bash
docker compose build --no-cache api
docker compose up -d api
```

### Frontend mostra tela em branco

- Hard reload: `Cmd+Shift+R`
- Verificar console do navegador (F12)
- Verificar bundle: `curl -s http://localhost:3000/ | grep '<title>'`

### Login retorna 401 com credenciais corretas

Provavelmente você trocou a senha em sessão anterior e perdeu. Reset:

```bash
docker compose exec api node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('admin123', 10);
  await p.user.update({
    where: { email: 'admin@bagre.local' },
    data: { passwordHash: hash, mustChangePwd: false }
  });
  await p.\$disconnect();
})();"
```
