# Terraform Provider Design — `terraform-provider-bagre`

> Status: **design draft**. A implementação vive em um repositório separado em Go (Terraform plugin framework v1).
>
> Issue: [#15](https://github.com/fabgcruz/bagre/issues/15). Quem topar implementar, abra um PR no repo `bagre` referenciando essa issue + aponte pro novo repo.

## Por quê

Operadores cloud-native modelam infra em IaC. Hoje, para criar uma subnet no Bagre, é preciso:
- Chamar a API REST manualmente, OU
- Usar a UI (não automatizável em pipeline)

Um provider Terraform expõe os recursos do Bagre como blocos HCL declarativos, permitindo gerenciar IPAM no mesmo `plan/apply` que VPC + EC2 + EKS.

## Repo

`github.com/fabgcruz/terraform-provider-bagre` — registrado em registry.terraform.io/providers/fabgcruz/bagre. Layout convencional:

```
terraform-provider-bagre/
├── main.go
├── internal/
│   ├── provider/
│   │   └── provider.go      # auth config (url, token)
│   ├── resource_site/
│   ├── resource_subnet/
│   ├── resource_ip_reservation/
│   └── data_subnet/
├── examples/
└── docs/
```

## Provider config

```hcl
terraform {
  required_providers {
    bagre = {
      source  = "fabgcruz/bagre"
      version = "~> 0.1"
    }
  }
}

provider "bagre" {
  url   = "https://bagre.empresa.local"
  token = var.bagre_jwt  # JWT obtido via POST /api/auth/login (ou via env BAGRE_TOKEN)
}
```

## Resources

### `bagre_site`
```hcl
resource "bagre_site" "sp3" {
  code        = "SP3"
  name        = "Data Center São Paulo 3"
  description = "Datacenter primário, Tamboré"
}
```

API: `POST /api/sites`, `PATCH /api/sites/:id`, `DELETE /api/sites/:id`.

### `bagre_subnet`
```hcl
resource "bagre_subnet" "prod_servers" {
  site_id     = bagre_site.sp3.id
  name        = "sp3-prod-srv"
  cidr        = "10.20.10.0/24"
  vlan_id     = 110
  description = "Servidores de produção"
}
```

API: `POST /api/subnets`, etc. IPs são pré-criados automaticamente pelo Bagre.

### `bagre_ip_reservation`
```hcl
resource "bagre_ip_reservation" "app_lb" {
  subnet_id = bagre_subnet.prod_servers.id
  address   = "10.20.10.10"  # opcional — se omitido, Bagre escolhe o próximo livre
  hostname  = "app-lb-01"
  type      = "Servidor Linux"
  function  = "production"
}
```

API: `POST /api/ips/:id/allocate` quando address informado; quando omitido, primeiro `GET /api/subnets/:id/next-free-ip` depois allocate.

## Data sources

### `data.bagre_subnet`
```hcl
data "bagre_subnet" "prod" {
  site_code = "SP3"
  name      = "sp3-prod-srv"
}

output "next_free" {
  value = data.bagre_subnet.prod.next_free_ip
}
```

Útil pra ler dados sem gerenciar no Terraform.

### `data.bagre_subnets_by_site`
Lista todas as subnets de um site.

## Auth flow

Provider usa JWT estático passado via `token` argument ou `BAGRE_TOKEN` env. Em uma próxima versão: support a API token rotation via `bagre_api_token` resource.

## Roadmap do provider

- v0.1 — sites, subnets, ip_reservations (read + write)
- v0.2 — cloud accounts, datacenter VLANs como recursos
- v0.3 — import (terraform import bagre_subnet.foo 42)
- v1.0 — production-ready, suite de testes contra Bagre real, docs no registry

## Por que não usar `restapi` provider genérico?

Funciona, mas:
- Sem schema typed (autocomplete IDE)
- Sem state computado (next-free-ip)
- Sem import via ID
- Pior DX

Provider dedicado vale a pena pelo onboarding em times grandes.
