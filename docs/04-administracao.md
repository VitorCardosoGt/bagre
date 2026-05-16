# Administração

> Operações exclusivas do perfil ADMIN: gestão de usuários, criação de sites/subnets, importação, auditoria.
> **Autor**: Fabricio Cruz

---

## Acesso administrativo

Ao logar com perfil **ADMIN**, a sidebar mostra um bloco extra:

- **Saúde da rede** — IPs stale, fantasmas, conflitos
- **Integrações** — status consolidado dos conectores
- **Usuários** — gestão de contas
- **SSO / Entra ID** — configuração de SSO
- **Auditoria** — log completo de alterações

---

## Gestão de usuários

### Visualizar usuários

Sidebar → **Usuários**. Mostra tabela com:
- **E-mail**
- **Nome**
- **Perfil** (combo ADMIN / READER, editável inline)
- **Status** (ativo / inativo)
- **Último login**
- Ações: 🔑 **reset** · ⏻ **desativar/reativar** · 🗑️ **remover**

### Criar usuário novo

1. Botão **+ Novo usuário**
2. **E-mail** (obrigatório, único)
3. **Nome** (opcional)
4. **Perfil**: READER (padrão, leitura) ou ADMIN
5. **Senha inicial** (opcional):
   - Se preenchida: usuário pode fazer login imediatamente
   - Se vazia: o sistema gera um **link de definição de senha** que aparece num banner amarelo no topo da página, com botão "copiar link". Envie o link ao usuário (válido por 7 dias)

### Promover/rebaixar usuário

Mude o combo "Perfil" diretamente na tabela. Mudança é gravada com auditoria.

> Você não consegue mudar o seu próprio perfil (combo desabilitado).

### Desativar usuário

Botão **⏻ desativar**. O usuário não consegue mais logar, mas o histórico dele continua.

> Para reativar, mesmo botão (vira **⏻ reativar**).

### Resetar senha de um usuário

Botão **🔑 reset**. Sistema gera um token único, banner amarelo aparece no topo com:
- E-mail do usuário
- Link copiável (`http://.../reset?token=XXXX`)
- Aviso: válido 7 dias, uso único

Envie o link ao usuário (Slack, email, qualquer canal). Quando ele abrir, vai cair direto na tela de reset.

### Remover usuário

Botão 🗑️ → confirmação. Restrições:
- Não pode remover você mesmo
- Não pode remover o **último admin ativo** (proteção contra lockout)

---

## Reset de senha (fluxo do usuário final)

Quando um usuário esquece a senha:

1. Acessa http://localhost:3000/login
2. Clica **Esqueci a senha**
3. Aba 1 — **Solicitar**: digita email → clica "Solicitar token"
   - Sistema gera o token e **registra nos logs do servidor** (no MVP local, sem SMTP)
   - O usuário precisa pedir o token a um admin (que vê nos logs ou gera via UI)
4. Aba 2 — **Aplicar token**: cola o token + nova senha (mínimo 8 chars) → "Redefinir senha"
5. Cai direto na tela de login

> **Caminho mais simples**: o admin gera o link via tela `/admin/users` → 🔑 reset → copia o link → manda pro usuário. O usuário só precisa abrir o link.

---

## Trocar a própria senha

1. Menu superior direito → **Meu perfil**
2. Senha atual + Nova senha + Confirme
3. **Salvar**

Se o sistema **forçou** a troca (primeira senha pós-reset), aparece banner amarelo: "Troca de senha obrigatória. Você precisa definir uma nova senha antes de continuar." — você é redirecionado pra essa tela automaticamente.

---

## Criação de sites e subnets

Visto em detalhe em [Uso diário](./03-uso-diario.md#sites--subnets). Resumo:

- **+ Novo site** no topo de `/sites`
- **⋯ → Nova subnet** no card de cada site
- Subnet com CIDR válido **gera todos os IPs automaticamente** (até 4096)
- Excluir site **cascateia** subnets + IPs

### Best practices

- Use código de site curto e único (ex: `SP3-RACK-12`)
- Use CIDR no formato canônico (`10.150.0.0/24`, não `10.150.0.0/255.255.255.0`)
- Documente a função no campo "Descrição" da subnet
- Use VLAN ID se aplicável (futuramente vai integrar com a aba VLANs do Equinix)

---

## Saúde da rede

Sidebar → **Saúde da rede**. Mostra:

### IPs stale
Marcados como em uso (`USED`) mas que não foram vistos por nenhum scanner há mais de N dias (configurável em `/admin/integrations/zabbix` → "Marcar como stale após").

Cada linha tem:
- **IP**
- **Hostname**
- **Localização** (site/subnet)
- **Última vez visto** ("há 12d") com fonte
- Link **abrir** que te leva pra subnet com o IP destacado

### Conflitos
IPs marcados manualmente como `CONFLICT` (mesmo IP em múltiplos hostnames, ou outro problema detectado).

### Fontes ativas
Badges mostrando quantos IPs cada fonte de descoberta alimenta (ex: `zabbix · 16 IPs`).

> Use essa tela como **TODO list** de saneamento. Cada IP stale é um candidato
> a ser deprovisionado ou marcado como livre depois de validar.

---

## Auditoria

Sidebar → **Auditoria**. Log imutável de **todas** as alterações no sistema.

### Filtros
- **Tipo de objeto** (IP, Site, Subnet, Regra firewall, Usuário, Zabbix config, OIDC config)
- **Ação** (Criou, Editou, Removeu, Liberou, Reservou, Login, Trocou senha, Sync, etc)
- **Usuário** (busca por substring no email)

### Cada linha mostra:
- **Quando** (timestamp)
- **Quem** (email do usuário ou "ingest" / "oidc" / "system")
- **Ação** (badge colorido)
- **Objeto** (tipo + ID)
- **Resumo** (campos mudados ou identificador-chave)

### Detalhe completo

Botão **ver detalhe** → modal com:
- Metadata (quando, quem, ação, objeto)
- **Diff lado a lado**: caixa vermelha (estado **antes**) e caixa verde (estado **depois**), em JSON formatado

> Senhas, tokens e secrets são **mascarados** no log
> (`••••••••AB12`). O original nunca aparece.

---

## Importação da planilha

A planilha original `data/Controle de IP - LAN.xlsx` é a fonte primária no
primeiro boot. Depois disso, o sistema é a fonte de verdade.

### Reimportar manualmente (caso a planilha seja atualizada)

```bash
# 1. Regere o seed.json
python3 scripts/extract_xlsx.py

# 2. Importe (idempotente)
docker compose exec api node src/import.js /app/seed.json
```

> O importador faz **upsert** por `(site, subnet, ip)`. Não apaga dados, mas pode sobrescrever se a planilha tiver valor para um campo que você editou no IPAM.

### Reimportar via API (sem entrar no contêiner)

```bash
curl -X POST http://localhost:3001/api/import/seed \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

Útil para automação (CI/CD).

---

## Configuração SSO Microsoft Entra ID

Visto em detalhe em [Integrações](./05-integracoes.md#sso-microsoft-entra-id).

Resumo dos passos:
1. Sidebar → **SSO / Entra ID**
2. Copia a Redirect URI mostrada
3. Cria um App Registration no Azure Entra ID, cola a Redirect URI lá
4. Volta no IPAM e cola: tenant ID + Client ID + Client Secret
5. **Testar conexão** → ✓ verde
6. **Habilitar SSO**

A partir daí, a tela de login mostra **"Entrar com Microsoft"** ao lado do formulário tradicional. Login local continua funcionando (fallback).

---

## Configuração da integração Zabbix

Sidebar → **Integrações** → card Zabbix → **Configurar** (ou diretamente `/admin/integrations/zabbix`).

Visto em detalhe em [Integrações](./05-integracoes.md#zabbix).

Resumo:
- URL do Zabbix
- API Token (recomendado) **ou** usuário/senha
- Intervalo de sincronização (padrão 15 min)
- Quantos dias para marcar IPs como stale (padrão 7)
- Filtro opcional por grupos do Zabbix
- Botões: **Testar conexão**, **Salvar**, **Sincronizar agora**, **Habilitar/Pausar**

---

## Operações de emergência

### Desativar SSO temporariamente
`/admin/sso` → botão **Desabilitar SSO** no topo. Não apaga a configuração — apenas remove o botão "Entrar com Microsoft" da tela de login. Login local continua funcionando.

### Pausar sync Zabbix
`/admin/integrations/zabbix` → botão **Pausar** no topo. O scheduler não roda mais até você reativar.

### Reset do admin via DB
Caso você tenha perdido acesso a todas as contas admin:

```bash
docker compose exec api node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('NovaSenhaSegura123', 10);
  await p.user.update({
    where: { email: 'admin@bagre.local' },
    data: { passwordHash: hash, mustChangePwd: false, role: 'ADMIN', active: true }
  });
  console.log('reset OK');
  await p.\$disconnect();
})();"
```
