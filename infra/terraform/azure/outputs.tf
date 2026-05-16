output "api_url" {
  description = "URL pública da API (App Service)"
  value       = "https://${azurerm_linux_web_app.api.default_hostname}"
}

output "web_url" {
  description = "URL pública da Web (App Service)"
  value       = "https://${azurerm_linux_web_app.web.default_hostname}"
}

output "acr_login_server" {
  description = "Endpoint do Container Registry"
  value       = azurerm_container_registry.acr.login_server
}

output "postgres_fqdn" {
  description = "FQDN do Postgres Flexible Server"
  value       = azurerm_postgresql_flexible_server.db.fqdn
}

output "key_vault_uri" {
  description = "URI do Key Vault"
  value       = azurerm_key_vault.kv.vault_uri
}

output "resource_group_name" {
  description = "Nome do Resource Group"
  value       = azurerm_resource_group.rg.name
}
