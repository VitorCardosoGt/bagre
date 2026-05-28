# Kubernetes Operator Design — `bagre-operator`

> Status: **design draft**. A implementação vive em um repositório separado em Go (Operator SDK ou Kubebuilder).
>
> Issue: [#16](https://github.com/fabgcruz/bagre/issues/16). Quem topar implementar, abra um PR no repo `bagre` apontando pro novo repo.

## Por quê

Times rodando em Kubernetes precisam de IPs estáticos para:
- LoadBalancers internos com endereço previsível
- StatefulSets que precisam re-bind no mesmo IP
- Workloads multi-cluster que se referenciam por IP

Hoje o fluxo é manual: o SRE reserva o IP no Bagre, depois cola em `loadBalancerIP:` ou `metallb` annotation. Um operator permite declarar essa reserva em YAML junto com o resto da app — GitOps puro.

## Repo

`github.com/fabgcruz/bagre-operator` — imagem em `ghcr.io/fabgcruz/bagre-operator:vX.Y.Z`. Helm chart em `chart/`.

```
bagre-operator/
├── api/v1alpha1/
│   ├── ip_reservation_types.go
│   └── subnet_claim_types.go
├── internal/controller/
│   ├── ip_reservation_controller.go
│   └── subnet_claim_controller.go
├── config/
│   ├── crd/bases/
│   ├── manager/
│   └── rbac/
└── chart/bagre-operator/
```

## CRDs

### `IpReservation`
```yaml
apiVersion: bagre.fabgcruz.io/v1alpha1
kind: IpReservation
metadata:
  name: my-app-lb
  namespace: production
spec:
  subnetRef:
    siteCode: SP3
    subnetName: sp3-prod-srv
  hostname: my-app-lb
  function: production
  # Opcional: address fixo. Se omitido, operator pede next-free-ip pro Bagre.
  # address: 10.20.10.10
  releaseOnDelete: true
status:
  address: 10.20.10.10
  bagreIpId: 42
  conditions:
    - type: Allocated
      status: "True"
      reason: AllocatedFromPool
      message: "Allocated 10.20.10.10 from sp3-prod-srv"
      lastTransitionTime: "2026-05-28T12:00:00Z"
```

Reconciliação:
1. Operator pede next-free-ip ou aloca address fixo via API do Bagre
2. Atualiza status.address
3. Quando o CR é deletado, libera o IP no Bagre (se `releaseOnDelete: true`)

### `SubnetClaim`
```yaml
apiVersion: bagre.fabgcruz.io/v1alpha1
kind: SubnetClaim
metadata:
  name: my-team-vlan
spec:
  parentCidr: 10.0.0.0/16
  size: 24                # quer um /24
  siteCode: SP3
  namePrefix: my-team
status:
  subnetId: 99
  cidr: 10.0.5.0/24
```

Reconciliação: operator chama `GET /api/cidr/next-free?parent=10.0.0.0/16&prefix=24` e cria a subnet via API.

## Integração com k8s nativo

### `Service.spec.loadBalancerIP` auto-fill via annotation
```yaml
apiVersion: v1
kind: Service
metadata:
  annotations:
    bagre.fabgcruz.io/reserve-from: "sp3-prod-srv@SP3"
spec:
  type: LoadBalancer
  # loadBalancerIP injetado pelo operator
```

Webhook mutating: ao criar Service com a annotation, operator cria IpReservation no Bagre e injeta `loadBalancerIP`.

### MetalLB IPAddressPool
Sync reverso: para cada subnet no Bagre marcada como `metallb-pool`, criar/atualizar IPAddressPool correspondente automaticamente.

## Auth do operator

ServiceAccount do operator monta um Secret com Bagre JWT:
```yaml
kind: Secret
metadata:
  name: bagre-credentials
data:
  url: https://bagre.empresa.local
  token: <base64 JWT>
```

Operator faz refresh do token via `/api/auth/login` antes de expirar (1h default).

## Roadmap

- v0.1 — IpReservation (manual subnetRef, lifecycle simples)
- v0.2 — SubnetClaim
- v0.3 — Service annotation auto-fill via webhook
- v0.4 — MetalLB sync
- v1.0 — production-ready, e2e tests com kind, Helm chart estável

## Alternativas consideradas

- **Calico IPAM externo** — Calico permite IPAM custom, mas só pra pods. Não cobre Services/LoadBalancers.
- **Cluster API IPAM** — recente, focado em VMs. Pode ser integração futura, não substituto.
