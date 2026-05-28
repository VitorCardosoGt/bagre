# gRPC API Design — Bagre

> Status: **design draft + .proto stub**. Implementação requer servidor gRPC em paralelo ao REST + manutenção dual.
>
> Issue: [#28](https://github.com/fabgcruz/bagre/issues/28). Sugestão original do Jesse Fernandes (LinkedIn).

## Decisão pendente

Antes de implementar, **validar a demanda**:

1. Quantos clientes do Bagre realmente precisam de gRPC vs REST? Hoje todos os exemplos (Terraform Provider, K8s Operator, scripts) são naturais em HTTP/JSON.
2. Disposição de manter duas APIs em sync (proto + REST)?
3. Codegen single-source-of-truth (proto → REST via grpc-gateway) vs APIs separadas?

**Recomendação:** abrir Discussion pública pra validar antes de codar. Se for adiante, este doc + o stub `proto/bagre.proto` são o ponto de partida.

## Quando gRPC compensa o custo

- **Bulk streaming** — importar/exportar milhões de IPs via stream em vez de paginação REST
- **Sidecar pattern em K8s** — pod auxiliar fala gRPC com Bagre central, latência baixa
- **Clientes polyglot** — gerar SDK em Go/Python/Java/Rust direto do .proto

## Arquitetura proposta

```
                  ┌─────────────┐
                  │   Fastify   │  (REST atual)
                  │  port :3001 │
                  └──────┬──────┘
                         │
                         ↓
                  ┌─────────────┐
                  │  Prisma /   │   (compartilhado)
                  │   modelos   │
                  └──────┬──────┘
                         │
                         ↑
                  ┌─────────────┐
                  │ @grpc/grpc-js│  (gRPC novo)
                  │  port :50051 │
                  └─────────────┘
```

Servidor gRPC roda no mesmo processo Node, lê do mesmo Prisma. Configurável: `GRPC_PORT` (vazio = desligado).

## `.proto` stub (subset mínimo read-only)

Veja `proto/bagre.proto`. Cobre:
- Sites: ListSites, GetSite
- Subnets: ListSubnets, GetSubnet, GetSubnetUtilization
- IPs: ListSubnetIps, AllocateIp, ReleaseIp
- CloudAccounts: ListCloudAccounts, TriggerSync

Não cobre: validation rules, DNS sync, audit, OIDC config — adicionar conforme demanda.

## Auth

Mesma estratégia REST: JWT via metadata `authorization: Bearer <token>`. Interceptor server-side verifica e popula `context.user` igual ao hook Fastify atual.

```js
const authInterceptor = (call, callback) => {
  const auth = call.metadata.get('authorization')?.[0];
  if (!auth?.startsWith('Bearer ')) {
    return callback({ code: grpc.status.UNAUTHENTICATED });
  }
  // verify JWT, attach user to call.user
};
```

## Roadmap

- **Fase 0 — Discussion** — abrir GitHub Discussion, coletar use cases reais
- **Fase 1 — proto schema** — refinar .proto stub via feedback
- **Fase 2 — server read-only** — implementar Sites/Subnets/IPs read-only (List/Get)
- **Fase 3 — mutations** — Allocate/Release/Create endpoints
- **Fase 4 — streaming** — bulk import/export via stream
- **Fase 5 — grpc-gateway** — auto-generate REST a partir do proto (single source of truth)

## Por que NÃO implementar agora

- Sem use case validado (a sugestão veio sem cenário concreto)
- Dobra superfície de API (manter REST + gRPC em sync = trabalho recorrente)
- Tooling Node gRPC tem aprendizado (build .proto, server lifecycle, interceptors)
- Bagre é jovem (0.x) — maximizar evolução do core IPAM antes de side-projects

## Por que adicionar o proto stub mesmo assim

- Quem chegar interessado já encontra ponto de partida
- Documenta intenção (vs deixar como "talvez no futuro")
- Convida a comunidade a propor mudanças no schema antes da implementação
