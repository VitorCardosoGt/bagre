# Uso diário

> Como navegar e operar o IPAM no dia a dia (admin ou reader).
> **Autor**: Fabricio Cruz

---

## Login

1. http://localhost:3000
2. Email + senha
3. ⌘+Enter ou clica **Entrar**

Se o admin tiver habilitado SSO Microsoft, aparecerá um botão **Entrar com Microsoft** abaixo do formulário. Detalhes em [Integrações](./05-integracoes.md#sso-microsoft-entra-id).

Esqueceu a senha → link **Esqueci a senha** → fluxo descrito em [Administração](./04-administracao.md#reset-de-senha).

---

## Layout

```
┌──────────────┬───────────────────────────────────────────┐
│ 🐟 BAGRE     │  busca global ⌘K            [avatar ▾]   │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│ Dashboard    │                                           │
│ Sites & Sub. │                                           │
│ Catálogos    │            CONTEÚDO PRINCIPAL              │
│ Firewall     │                                           │
│ Calc CIDR    │                                           │
│ Integ./API   │                                           │
│ Saúde rede ★ │                                           │
│ Integrações★ │                                           │
│ Usuários ★   │                                           │
│ Auditoria ★  │                                           │
│              │                                           │
│ ☾ Tema       │                                           │
└──────────────┴───────────────────────────────────────────┘
        ★ visível apenas para perfil ADMIN
```

---

## Dashboard

Página inicial após login. Mostra:

- **Saudação** com seu nome
- **4 atalhos visuais**: Ver IPs por site · Calculadora CIDR · Firewall · Integrações
- **Resumo**: total de sites · subnets · IPs em uso · IPs livres · % utilizado
- **Utilização por site**: barra de progresso colorida (verde/amarelo/vermelho)

Cores das barras:
- 🟢 verde: até 50% de uso
- 🟡 amarelo: 50-80%
- 🔴 vermelho: > 80% (alerta de capacity)

---

## Sites & Subnets

Lista todos os sites em cards. Cada card mostra:

- **Código** do site (ex: BAGRE-SP3)
- **Resumo** (X subnets · Y/Z IPs em uso)
- Lista de subnets com **barra de progresso** individual e CIDR
- Click numa subnet → detalhe da subnet (lista de IPs)

### Buscar site/subnet específica

Campo "Filtrar por site, subnet ou CIDR…" no topo da página filtra em tempo real.

### Criar novo site (ADMIN)

1. Botão **+ Novo site** no canto superior direito
2. Code: identificador curto (ex: `SP3-NEW-DC`)
3. Nome amigável (opcional, ex: `Datacenter SP3 expansão`)
4. Descrição (opcional)
5. **Criar site**

### Criar nova subnet (ADMIN)

1. No card do site, clica **⋯** → **Nova subnet**
2. Nome: identificador da subnet (ex: `LAN-PROD-WEB`)
3. **CIDR** (obrigatório): ex: `10.150.5.0/24`
   - O sistema mostra preview: *"Vai gerar 254 IPs utilizáveis"*
4. VLAN ID (opcional)
5. Descrição (opcional)
6. **Criar subnet**

> Os IPs são gerados automaticamente. Para uma /24 são 254 IPs livres.
> Limite de geração: **4096 IPs por subnet**.

### Editar site / subnet (ADMIN)

Menu **⋯** → **Editar**. Pode mudar nome e descrição. CIDR de subnet **não pode** mudar (afetaria os IPs já existentes).

### Excluir site / subnet (ADMIN)

Menu **⋯** → **Excluir**. Confirmação destrutiva mostra impacto: *"Vai apagar X subnets e Y IPs. Ação definitiva."*

---

## Detalhe da subnet (lista de IPs)

A tela mais usada do sistema.

### Cabeçalho

- Breadcrumb com site + nome da subnet
- CIDR em monospace
- **Card de utilização**: contador grande "X / Y" + % + barra colorida + legenda (🔵 em uso 🟡 reservado 🟢 livre)

### Toolbar

- 🔍 **Buscar IP, hostname, função…** (filtra em tempo real)
- **Pílulas de status**: [Todos] [Em uso] [Reservados] [Livres]
- ↻ **Recarregar**

### Tabela

Colunas:
1. **Endereço** (font monospace)
2. **Status** (badge colorido)
3. **Equipamento** — Tipo + OS + vendor/modelo (vem do Zabbix)
4. **Hostname** (editável inline)
5. **MAC / Função** — MAC address (vem do Zabbix) + função do equipamento
6. **Ações** (apenas ADMIN)

### Editar inline (ADMIN)

Clica em qualquer célula editável (Tipo, Hostname, Função):
1. Vira input
2. Digite o valor
3. **Enter** salva
4. **Esc** cancela
5. Ícone ✓ (verde) também salva, ✗ cancela

> Se você preencher qualquer campo (tipo/hostname/função), o status do IP
> automaticamente muda para "Em uso". Para liberá-lo, use **Liberar**.

### Reservar IP (ADMIN)

Botão **🟡 Reservar** na coluna Ações. Marca o IP como reservado (cor amarela). Útil para "guardar" IPs que serão usados em breve.

### Liberar IP (ADMIN)

Botão **Liberar** na coluna Ações. Apaga todos os campos (tipo/hostname/função/notes) e marca como livre.

---

## Catálogos

Listas auxiliares importadas da planilha original. Três abas:

### Ranges Mestre
CIDRs corporativos com descrição (ex: `10.150.0.0/16 — Datacenter SP3`).

### Equinix VLANs
Lista de VLANs do datacenter Equinix (Vlan ID, network, range, broadcast).

### Azure Subnets
Lista de subnets das vNets Azure-SCE.

Estes catálogos são **read-only** na UI. Atualizam quando a planilha é reimportada.

---

## Firewall

Tela com as regras de tráfego entre redes (Azure ↔ Equinix). Cada linha tem:

- **Sentido** (ex: "EQX > Azure")
- Incoming Interface
- Outgoing Interface
- **Origem** (CIDR ou nome)
- **Destino** (CIDR)
- **Porta**
- **Serviço** (ssh, https, sql server, etc)
- **Protocolo** (tcp/udp)

### Criar regra (ADMIN)

Botão **+ Nova regra** → linha em branco aparece → preencha as colunas → botão **Salvar** azul aparece quando dirty → confirma.

### Excluir regra (ADMIN)

Ícone 🗑️ vermelho ao final da linha.

---

## Calculadora CIDR

Cole um CIDR (ex: `10.150.0.0/24`) e veja:

- Network address
- Broadcast
- Máscara (decimal)
- Primeiro IP utilizável
- Último IP utilizável
- Prefixo (em formato `/24`)
- Total de endereços
- Endereços utilizáveis

Abaixo, **Tabela de referência** completa de `/0` a `/32` com máscara, total, utilizáveis e quantos `/24s` cabem.

---

## Busca global ⌘K

Atalho **⌘K** (ou `Ctrl+K` no Linux/Windows) abre a busca global. Funciona em qualquer tela.

Busca em:
- **IPs** (por endereço, hostname, tipo, função)
- **Subnets** (por nome, CIDR, label)
- **Sites** (por código, nome)

Resultados são clicáveis e te levam direto pra subnet/site. Quando você abre um IP via busca, ele aparece **destacado em amarelo** na lista da subnet.

> A busca exige no mínimo 2 caracteres.

---

## Meu perfil

Menu do canto superior direito → **Meu perfil**:

- Vê seu email e role
- **Trocar senha** (requer senha atual)

Se o admin tiver forçado uma troca de senha (após reset), você cai aqui automaticamente após o login.

---

## Tema claro / escuro

Botão **☾ Tema escuro** / **☀ Tema claro** no canto inferior esquerdo do menu lateral. Preferência salva por usuário (localStorage).

---

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `⌘K` / `Ctrl+K` | Abre busca global |
| `Enter` (em célula editável) | Salva |
| `Esc` (em célula editável) | Cancela edição |
| `Tab` (em formulários) | Próximo campo |

---

## O que perfil READER vê de diferente

- Sem botões "Novo site", "Nova subnet", "Editar"
- Sem menu **⋯** nos cards de site/subnet
- IPs aparecem como texto, não editáveis
- Botões **Reservar** e **Liberar** ocultos
- Páginas administrativas (`/admin/*`) não aparecem na sidebar
- Banner **🔒 somente leitura** em telas que normalmente teriam ações

Tudo verificado também na API: tentativas de PATCH/POST/DELETE retornam **403 forbidden**.
