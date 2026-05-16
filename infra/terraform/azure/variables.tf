variable "subscription_id" {
  type        = string
  description = "ID da Azure subscription onde o IPAM seria provisionado"
  default     = "00000000-0000-0000-0000-000000000000"
}

variable "location" {
  type        = string
  description = "Região Azure"
  default     = "Brazil South"
}

variable "project_name" {
  type        = string
  description = "Nome curto do projeto (vai pro nome dos recursos)"
  default     = "bagre"
}

variable "environment" {
  type        = string
  description = "Ambiente (dev, staging, prod)"
  default     = "prod"
}

variable "tags" {
  type        = map(string)
  description = "Tags aplicadas a todos os recursos"
  default = {
    Project    = "bagre"
    ManagedBy  = "terraform"
    CostCenter = "infra-sce"
  }
}
