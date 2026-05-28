# SNMP Discovery + Topology Graph — Design

> Status: **design draft**. Implementação requer biblioteca SNMP (`net-snmp` em Node ou pacote SNMP nativo num repo Go separado) e é escopo multi-sessão.
>
> Issue: [#26](https://github.com/fabgcruz/bagre/issues/26). Sugestão original do Raul Libório (LinkedIn) com referência ao Netdisco.

## Objetivo

Adicionar à atual stack de discovery (Zabbix + Prometheus) uma **terceira fonte: SNMP polling direto contra switches/roteadores**. Diferente do Zabbix (que já consolidou os dados), aqui o Bagre fala SNMP nativamente, o que permite extrair:

1. **MAC address table** (Bridge MIB `dot1dTpFdbAddress`) → mapeamento `MAC → porta de switch`.
2. **LLDP neighbors** (LLDP-MIB) → quem está plugado em quem.
3. **CDP** (Cisco proprietário) → similar a LLDP em ambientes Cisco.
4. **Interface table** (IF-MIB) → status, descrição, velocidade de cada porta.

Combinando essas tabelas com os IPs já no Bagre (via cruzamento por MAC), monta-se um **grafo de topologia** mostrando visualmente "que máquina está plugada em qual switch, quem é core".

## Schema novo

```prisma
model NetworkDevice {
  id           Int       @id @default(autoincrement())
  hostname     String    @unique
  managementIp String?   // IP usado pra SNMP polling
  vendor       String?
  model        String?
  serialNumber String?
  siteId       Int?
  site         Site?     @relation(fields: [siteId], references: [id])
  // SNMP
  snmpVersion  String?   // v2c | v3
  snmpCommunity String?  // v2c only — armazenado cifrado (AES-256-GCM)
  snmpV3User   String?
  snmpV3AuthProto String?
  snmpV3PrivProto String?
  // ... outros campos v3 cifrados
  lastPolledAt DateTime?
  lastPollStatus String?

  ports        Port[]

  @@index([hostname])
  @@index([siteId])
}

model Port {
  id          Int      @id @default(autoincrement())
  deviceId    Int
  device      NetworkDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  name        String   // ex: "GigabitEthernet1/0/1"
  ifIndex     Int      // SNMP IF-MIB index
  description String?
  speed       BigInt?  // bits/sec
  adminStatus String?  // up | down
  operStatus  String?
  vlanId      Int?     // primary VLAN

  members     PortMembership[]
  neighborsAsLocal     Neighbor[] @relation("LocalPort")
  neighborsAsRemote    Neighbor[] @relation("RemotePort")

  @@unique([deviceId, ifIndex])
}

model PortMembership {
  id        Int       @id @default(autoincrement())
  portId    Int
  port      Port      @relation(fields: [portId], references: [id], onDelete: Cascade)
  macAddress String   // AA:BB:CC:DD:EE:FF
  vlanId    Int?
  firstSeen DateTime  @default(now())
  lastSeen  DateTime  @default(now())
  // Pode ser cruzado com IpAddress.macAddress pra inferir o IP da máquina

  @@unique([portId, macAddress])
  @@index([macAddress])
}

model Neighbor {
  id           Int   @id @default(autoincrement())
  localPortId  Int
  localPort    Port  @relation("LocalPort", fields: [localPortId], references: [id], onDelete: Cascade)
  remotePortId Int?
  remotePort   Port? @relation("RemotePort", fields: [remotePortId], references: [id], onDelete: SetNull)
  // Se o vizinho ainda não está no Bagre como NetworkDevice, guarda raw
  remoteHostname    String?
  remotePortName    String?
  protocol     String   // LLDP | CDP
  discoveredAt DateTime @default(now())

  @@index([localPortId])
}
```

## Discovery flow

1. **Seed** — operador adiciona N `NetworkDevice` com management IPs.
2. **Polling job** (similar ao Zabbix scheduler):
   - Para cada device, abrir sessão SNMP, walk em:
     - IF-MIB (ifTable + ifXTable) → cria/atualiza `Port`s
     - Bridge MIB (dot1dTpFdbTable) → cria/atualiza `PortMembership` (MAC→porta)
     - LLDP-MIB (lldpRemTable) → cria/atualiza `Neighbor`s
3. **Auto-descoberta**: ao encontrar um vizinho via LLDP que não está no Bagre como `NetworkDevice`, criar uma entrada `pending_network_device` (similar ao `PendingDiscovery` existente pra hosts) → admin aprova → vira `NetworkDevice` real → polling segue de lá (graph traversal automático).
4. **Cruzamento com IPs**: `IpAddress.macAddress` já existe; juntar com `PortMembership.macAddress` infere "IP X.Y.Z.W está na porta Gi1/0/12 do switch sw-core-01".

## API REST

- `GET /api/network-devices`
- `POST /api/network-devices` (admin)
- `POST /api/network-devices/:id/poll-now` (admin) — força polling
- `GET /api/topology` — retorna grafo serializado pronto pra frontend:
  ```json
  {
    "nodes": [
      { "id": "device-1", "type": "switch", "label": "sw-core-01", "vendor": "Cisco" },
      { "id": "device-2", "type": "switch", "label": "sw-access-01" }
    ],
    "edges": [
      { "source": "device-1", "target": "device-2", "localPort": "Gi1/0/1", "remotePort": "Gi0/1", "protocol": "LLDP" }
    ]
  }
  ```

## UI

Página `/topology` com grafo interativo. Bibliotecas candidatas:

| Lib | Pros | Cons |
|---|---|---|
| **vis-network** | Mais usado em network topology; pronto | ~300KB |
| **reactflow** | Bonito, customizável, React-native | Não tem layout force-directed pronto |
| **cytoscape.js** | Acadêmico, layouts ricos | Maior, API complexa |

Recomendação: **vis-network** pra v1 — outputs mais alinhados com o que o usuário espera (estilo Netdisco/CDP map).

Features mínimas:
- Layout force-directed default; toggle pra hierárquico (core → distribution → access)
- Click em nó → painel lateral com IPs, portas, MACs aprendidos
- Filtros: por site, por VLAN, esconder portas down
- Search bar pra centralizar em um device específico

## Auth/SNMP credentials

Comunidades SNMP v2c e creds v3 são **secrets** → cifrar no DB (mesma chave `CLOUD_CREDS_KEY` ou nova `SNMP_CREDS_KEY`).

## Biblioteca SNMP

Opções:

| Lib | Stack | Notas |
|---|---|---|
| **net-snmp** (npm) | Node | Pure JS, sem deps nativas. Suporta v1/v2c/v3, MIB compilation manual. Boa pra v1. |
| **easy-snmp** (npm) | Node | Wrapper mais alto-nível de net-snmp |
| **gosnmp** (Go) | Go (repo separado) | Performance maior pra mass-polling. Vale se o Bagre tiver 1k+ devices. |

Recomendação: começar com **net-snmp** no próprio repo Node — evita repo novo. Migrar pra Go-poller separado se a escala precisar (≥1k devices fica caro em Node).

## Roadmap

- **v0.1** — schema + polling manual de um device (sem scheduler) + 1 endpoint topology. UI: tabela simples de devices.
- **v0.2** — scheduler periódico (similar ao Zabbix), LLDP discovery, cruzamento MAC→IP.
- **v0.3** — UI de grafo (vis-network) com layout force-directed.
- **v0.4** — auto-discovery via LLDP (descobre switches novos sem seed manual).
- **v1.0** — CDP support, port history, filtros avançados, e2e tests.

## Por que vale a pena (diferencial)

Citação do Raul ao sugerir:

> "[Netdisco] Tem uma funcionalidade que faz discovery na rede usando SNMP, e cria um desenho topográfico. Coloca visualmente que máquina está plugada em qual switch, quem são os cores. É uma funcionalidade que fez toda a diferença na hora da escolha de qual ferramenta usar."

Topology visual é **differentiator forte vs NetBox** (que faz tabular bem, mas não mapa nativamente) e vs phpIPAM (que não tem). Coloca o Bagre numa categoria diferente — não só "IPAM moderno" mas "IPAM com visão de rede".

## Esforço estimado

- v0.1: 2-3 sessões focadas
- v0.2-v0.3: mais 3-4 sessões
- v1.0: 2 meses de trabalho consistente

Não cabe em sessão única. Essa doc serve pra alinhar escopo antes da implementação.
