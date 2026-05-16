# `infra/terraform/azure/` — IPAM em Azure (versão futura)

Terraform que descreve como o IPAM **seria** se rodasse em Azure (em vez do SP3 onde roda hoje). **NÃO foi aplicado** — usado pra:

1. Gerar diagrama de arquitetura via `terravision` (visualização).
2. Ter base pronta pra quando outras frentes (Tele\*, Hub-Spoke) forem terraformadas.
3. Aprender padrões de Terraform Azure num cenário familiar.

> **Importante:** o IPAM **continua rodando no ** via `infra/deploy.sh`. Este Terraform é exercício/futuro, não substitui nada.

---

## Recursos descritos (12 ao todo)

| Categoria | Recurso | Equivalente no SP3 |
|---|---|---|
| **Container** | Resource Group | n/a (na Azure tudo precisa morar num RG) |
| **Rede** | VNet + 2 Subnets (app, db) | rede do compose |
| **Rede** | NSG + association | (n/a — firewall era do SP3) |
| **Imagens** | Container Registry (ACR) | imagens locais Docker |
| **Banco** | Postgres Flexible Server + DB | container `db` |
| **Banco** | Storage Account + container | (n/a — backup novo) |
| **Secrets** | Key Vault + secret | `.env` no host |
| **App** | App Service Plan | host VM |
| **App** | App Service (api) | container `api` |
| **App** | App Service (web) | container `web` |
| **Observabilidade** | Log Analytics + Application Insights | (n/a — futuro) |

---

## Como gerar o diagrama com terravision

### 1. Pré-requisitos

```bash
# graphviz (binário do sistema)
brew install graphviz

# terravision (Python)
pip install terravision
```

### 2. Gerar

```bash
cd /Users/fabricio/Documents/code/bagre
terravision draw --source ./infra/terraform/azure --output ./docs/azure-arch.png
```

A imagem é gerada em `docs/azure-arch.png` com **ícones oficiais Azure**.

### 3. Re-gerar quando mexer

Toda vez que você editar um `.tf`, rode terravision de novo. (Versão automática via git hook fica pra depois.)

---

## Como aplicar de verdade (quando tiver acesso Azure)

⚠️ Você ainda não tem credenciais Azure. Quando tiver:

```bash
# 1. Instalar Azure CLI e login
brew install azure-cli
az login

# 2. Configurar variáveis
cp terraform.tfvars.example terraform.tfvars
# editar: subscription_id real, environment, etc

# 3. Aplicar
terraform init
terraform plan
# REVISAR plan com calma
terraform apply
```

---

## State backend (recomendação pra produção)

Por padrão, o `terraform.tfstate` fica local — **inseguro** pra produção. Pra apply real:

1. Crie manualmente um Storage Account + container `tfstate` no Azure (paradoxo do estado inicial).
2. Adicione no `versions.tf`:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-tfstate"
    storage_account_name = "stbagretfstate"
    container_name       = "tfstate"
    key                  = "ipam-prod.tfstate"
  }
}
```

3. `terraform init -migrate-state`.

---

## Estrutura

```text
infra/terraform/azure/
├── versions.tf              ← versões Terraform + providers
├── providers.tf             ← config azurerm
├── variables.tf             ← inputs
├── main.tf                  ← TODOS os 12 recursos
├── outputs.tf               ← URLs e endpoints úteis
├── terraform.tfvars.example ← template de valores
└── README.md                ← este arquivo
```
