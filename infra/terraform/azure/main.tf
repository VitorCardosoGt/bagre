# =============================================================================
# Bagre — equivalente Azure (espelha o stack do SP3)
# Hoje rodando no  via docker-compose; este Terraform descreve como
# seria a versão Azure equivalente. Não foi aplicado — usado pra visualização
# da topologia via terravision e como base pra futuras frentes (Tele*, etc).
# =============================================================================

# -----------------------------------------------------------------------------
# Resource Group — container de tudo
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "rg" {
  name     = "rg-${var.project_name}-${var.environment}"
  location = var.location
  tags     = var.tags
}

# -----------------------------------------------------------------------------
# Virtual Network + Subnets — isolamento de rede
# -----------------------------------------------------------------------------
resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-${var.project_name}"
  address_space       = ["10.20.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = var.tags
}

resource "azurerm_subnet" "app" {
  name                 = "snet-app"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.20.1.0/24"]

  delegation {
    name = "appservice-delegation"
    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_subnet" "db" {
  name                 = "snet-db"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.20.2.0/24"]
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "fs-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# -----------------------------------------------------------------------------
# Network Security Group — firewall da subnet de app
# -----------------------------------------------------------------------------
resource "azurerm_network_security_group" "app_nsg" {
  name                = "nsg-${var.project_name}-app"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = var.tags

  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "app_assoc" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app_nsg.id
}

# -----------------------------------------------------------------------------
# Container Registry — imagens Docker (api + web do IPAM)
# -----------------------------------------------------------------------------
resource "azurerm_container_registry" "acr" {
  name                = replace("acr${var.project_name}${var.environment}", "-", "")
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

# -----------------------------------------------------------------------------
# PostgreSQL Flexible Server — equivalente ao container db do compose
# -----------------------------------------------------------------------------
resource "random_password" "pg_admin" {
  length  = 32
  special = true
}

resource "azurerm_postgresql_flexible_server" "db" {
  name                   = "psql-${var.project_name}-${var.environment}"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "15"
  administrator_login    = "bagre_admin"
  administrator_password = random_password.pg_admin.result
  delegated_subnet_id    = azurerm_subnet.db.id
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
  backup_retention_days  = 14
  zone                   = "1"
  tags                   = var.tags
}

resource "azurerm_postgresql_flexible_server_database" "ipam" {
  name      = "bagre"
  server_id = azurerm_postgresql_flexible_server.db.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# -----------------------------------------------------------------------------
# Key Vault — secrets (JWT_SECRET, DB password, ingest tokens)
# -----------------------------------------------------------------------------
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "kv" {
  name                       = "kv-${var.project_name}-${var.environment}"
  resource_group_name        = azurerm_resource_group.rg.name
  location                   = azurerm_resource_group.rg.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  tags                       = var.tags
}

resource "azurerm_key_vault_secret" "pg_password" {
  name         = "postgres-admin-password"
  value        = random_password.pg_admin.result
  key_vault_id = azurerm_key_vault.kv.id
}

# -----------------------------------------------------------------------------
# App Service Plan — host compartilhado pros 2 App Services
# -----------------------------------------------------------------------------
resource "azurerm_service_plan" "asp" {
  name                = "asp-${var.project_name}-${var.environment}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
  tags                = var.tags
}

# -----------------------------------------------------------------------------
# App Service — API (equivalente ao container 'api' do compose)
# -----------------------------------------------------------------------------
resource "azurerm_linux_web_app" "api" {
  name                = "app-${var.project_name}-api-${var.environment}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.asp.location
  service_plan_id     = azurerm_service_plan.asp.id

  site_config {
    application_stack {
      docker_image_name   = "bagre-api:latest"
      docker_registry_url = "https://${azurerm_container_registry.acr.login_server}"
    }
    vnet_route_all_enabled = true
    health_check_path      = "/api/health"
  }

  app_settings = {
    PORT       = "3001"
    NODE_ENV   = "production"
    JWT_SECRET = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.pg_password.id})"
  }

  virtual_network_subnet_id = azurerm_subnet.app.id
  tags                      = var.tags
}

# -----------------------------------------------------------------------------
# App Service — Web (equivalente ao container 'web' / nginx do compose)
# -----------------------------------------------------------------------------
resource "azurerm_linux_web_app" "web" {
  name                = "app-${var.project_name}-web-${var.environment}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.asp.location
  service_plan_id     = azurerm_service_plan.asp.id

  site_config {
    application_stack {
      docker_image_name   = "bagre-web:latest"
      docker_registry_url = "https://${azurerm_container_registry.acr.login_server}"
    }
  }

  app_settings = {
    API_URL = "https://${azurerm_linux_web_app.api.default_hostname}"
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Observabilidade — Log Analytics + Application Insights
# -----------------------------------------------------------------------------
resource "azurerm_log_analytics_workspace" "law" {
  name                = "law-${var.project_name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_application_insights" "appi" {
  name                = "appi-${var.project_name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  workspace_id        = azurerm_log_analytics_workspace.law.id
  application_type    = "web"
  tags                = var.tags
}

# -----------------------------------------------------------------------------
# Storage Account — backup do Postgres (snapshots agendados pelo Azure)
# -----------------------------------------------------------------------------
resource "azurerm_storage_account" "backup" {
  name                     = replace("st${var.project_name}bkp${var.environment}", "-", "")
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = var.tags
}

resource "azurerm_storage_container" "pg_backups" {
  name                  = "postgres-backups"
  storage_account_name  = azurerm_storage_account.backup.name
  container_access_type = "private"
}
