# Integrações — passo a passo técnico

> Como configurar **AD (Entra ID)** e **Zabbix** no IPAM, uma vez que você tiver as credenciais/acessos.
> Pra os textos de **solicitação** dessas credenciais, ver `REQUESTS.md`.

---

## 1. Entra ID (AD) — SSO

### O que o IPAM precisa receber do AD admin

| Campo | Onde no Entra ID | Formato | Exemplo |
|---|---|---|---|
| **Tenant ID** | Entra ID → Overview → Directory ID | GUID | `12345678-1234-...` |
| **Client ID** | App registrations → IPAM → Application (client) ID | GUID | `87654321-...` |
| **Client Secret** | App registrations → IPAM → Certificates & secrets → New client secret → **Value** (só aparece 1×) | string longa | `Abc~1234.xyz...` |
| **Redirect URI** | App registrations → IPAM → Authentication → Web → Redirect URIs | URL | `http://[ip-vm]:3000/api/auth/sso/callback` |

### Configuração no IPAM (após receber os 4 valores)

1. Login no IPAM como bootstrap admin: `http://[ip-vm]:3000`
2. Menu → **Admin → SSO/OIDC**
3. Preencher:

| Campo da UI | Valor |
|---|---|
| **Enabled** | ✓ ON |
| **Issuer URL** | `https://login.microsoftonline.com/[TENANT_ID]/v2.0` |
| **Client ID** | (do AD admin) |
| **Client Secret** | (do AD admin) |
| **Redirect URI** | `http://[ip-vm]:3000/api/auth/sso/callback` (mesmo registrado no AD) |
| **Scopes** | `openid profile email` |
| **Button Label** | "Entrar com Entra ID" (ou customize) |

4. **Salvar**

### Validação

```bash
# Confirma que /api/config retorna oidc.enabled = true
curl -s http://[ip-vm]:3001/api/config | python3 -m json.tool
# esperado:
# { "auth": { "local": true, "oidc": { "enabled": true, "buttonLabel": "..." } } }
```

Depois:
1. Logout
2. Tela de login mostra botão "Entrar com Entra ID"
3. Clica → redireciona pra Microsoft login → autentica → volta logado no IPAM
4. UI → Admin → Users — confirma que seu user foi criado/atualizado com role correta

### Mapeamento de role (claim → role)

Por padrão, primeiros logins via SSO ganham role `READER`. Pra promover:
- UI → Admin → Users → editar seu user → role = `ADMIN`

Pra mapeamento automático (ex.: pertence ao grupo X no AD → vira ADMIN), configurar via Entra ID app roles + claim transformation. Documentar separadamente quando implementado.

### Troubleshooting

| Sintoma | Provável causa | Fix |
|---|---|---|
| Botão "Entrar com Entra ID" não aparece | `oidc.enabled = false` em `/api/config` | Confirma que salvou config + cliente foi cacheado (UI pode demorar 30s) |
| `redirect_uri_mismatch` no Microsoft login | Redirect URI no IPAM ≠ registrado no Entra ID | Compara EXATAMENTE os 2 (porta, http vs https, trailing slash) |
| `invalid_client` | Client secret errado | Re-gera no Entra ID e atualiza no IPAM |
| `unauthorized_client` | App não tem permissão | Admin precisa "Grant consent" nas API permissions |
| Volta no IPAM com erro de claim | Scopes insuficientes | Confirma `openid profile email` nos scopes |

---

## 2. Zabbix — envio de discoveries

### Como o IPAM recebe

**Endpoint:** `POST http://[ip-vm-sp3]:3001/api/ingest/discoveries`

**Headers:**
```
Content-Type: application/json
X-Ingest-Token: [valor-do-INGEST_TOKEN-no-.env-do-IPAM]
```

**Body (1 ou N discoveries por chamada):**
```json
{
  "discoveries": [
    {
      "address": "10.150.1.42",
      "subnetCidr": "10.150.1.0/24",
      "hostname": "srv-app-01",
      "type": "Server",
      "function": "App backend",
      "macAddress": "aa:bb:cc:dd:ee:ff",
      "vendor": "VMware",
      "source": "zabbix-discovery"
    }
  ]
}
```

**Resposta 200:**
```json
{
  "received": 1,
  "updated": 1,
  "unmatched": [],
  "errors": []
}
```

### Como `where` é resolvido (importante)

O IPAM tenta achar o IP no banco usando UM destes critérios (em ordem):

1. **`address` + `subnetCidr`** (preferido, mais específico)
2. **`address` + `siteCode`**
3. **`address`** sozinho (busca em qualquer subnet — pode dar match errado se mesmo IP existe em sites diferentes)

> Sempre que possível, mande `subnetCidr` ou `siteCode` pra evitar ambiguidade.

### Opção A — External Script no Zabbix (recomendado pra começar)

Script bash/python que roda no servidor Zabbix (ou em frontend).

**Exemplo (`zabbix-to-ipam.sh`):**
```bash
#!/usr/bin/env bash
IPAM_URL="http://[ip-vm-sp3]:3001/api/ingest/discoveries"
TOKEN="${INGEST_TOKEN}"   # vem do environment do Zabbix server

# Monta payload (exemplo — substituir pela query real do Zabbix DB ou API)
PAYLOAD='{
  "discoveries": [
    {
      "address": "10.150.1.42",
      "subnetCidr": "10.150.1.0/24",
      "hostname": "srv-app-01",
      "source": "zabbix-script"
    }
  ]
}'

curl -s -X POST "$IPAM_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Token: $TOKEN" \
  -d "$PAYLOAD"
```

Agendar via cron no Zabbix server (ex.: a cada hora):
```cron
0 * * * * INGEST_TOKEN="..." bash /etc/zabbix/scripts/zabbix-to-ipam.sh
```

### Opção B — HTTP Agent Item (Zabbix nativo)

No Zabbix UI:

1. **Configuration → Hosts → Create host** (ou usa um existente)
   - Host name: `IPAM-Sync`
2. **Items → Create item**:
   - Type: `HTTP agent`
   - Key: `ipam.sync`
   - URL: `http://[ip-vm-sp3]:3001/api/ingest/discoveries`
   - Request type: `POST`
   - Headers:
     - `Content-Type: application/json`
     - `X-Ingest-Token: {$IPAM_INGEST_TOKEN}` (define como user macro no host)
   - Request body type: `JSON data`
   - Request body: payload dinâmico baseado em itens descobertos
   - Update interval: `1h` (ou conforme necessidade)

### Opção C — Action + Operation (após auto-discovery rule)

Se o Zabbix tem **Discovery Rules** ativas:

1. **Configuration → Actions → Discovery actions → Create**
2. Conditions: trigger quando rule X descobre host
3. Operation: `Custom script` rodando o `zabbix-to-ipam.sh` com os dados do host descoberto

### Validação (após qualquer opção)

**Teste manual:**
```bash
curl -s -X POST http://[ip-vm-sp3]:3001/api/ingest/discoveries \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Token: [token]" \
  -d '{"discoveries":[{"address":"10.150.1.42","subnetCidr":"10.150.1.0/24","hostname":"test-zabbix","source":"manual-test"}]}'
```

Esperado:
```json
{ "received": 1, "updated": 1, "unmatched": [], "errors": [] }
```

Se `unmatched: [...]`: o IP/subnet não existe no IPAM ainda (cadastra primeiro).
Se `errors: [...]`: algo no payload — confere o `reason`.

**Confirmar no IPAM:**
- UI → IPs → busca por `10.150.1.42`
- Vê `hostname: test-zabbix` populado e `source: manual-test`

### Heartbeat (opcional)

Pra Zabbix avisar "tô vivo, conexão funcionando":

```bash
curl -s -X POST http://[ip-vm-sp3]:3001/api/ingest/heartbeat \
  -H "X-Ingest-Token: [token]" \
  -d '{"source":"zabbix"}'
```

IPAM registra timestamp da última vez que o Zabbix se manifestou — útil pra detectar quando integração quebra.

### Troubleshooting Zabbix → IPAM

| Resposta IPAM | Causa | Fix |
|---|---|---|
| `503 ingest disabled` | `INGEST_TOKEN` vazio no `.env` do IPAM | Gera token, salva no `.env`, reinicia api |
| `403 invalid ingest token` | Token enviado ≠ `INGEST_TOKEN` configurado | Confere se Zabbix tá mandando o valor certo |
| `400 discoveries must be an array` | Payload não tem `discoveries: [...]` | Ajusta JSON |
| `unmatched: [...]` | IP/subnet não existe no IPAM | Cadastra subnet primeiro, depois reenvia |
| Connection refused | Firewall / IPAM não rodando | Confere `curl /api/health` antes |

---

## 3. Outras integrações futuras (não implementadas)

Listadas pra registro:

| Integração | Quando | Como |
|---|---|---|
| **Prometheus** | Imediato — `/metrics` já exposto | Adicionar scrape config no Prometheus apontando pra `:3001/metrics` |
| **Grafana** | Após Prometheus | Importar/criar dashboards consumindo métricas IPAM |
| **Slack/Teams notifications** | Quando IP muda criticamente | Webhook outbound do IPAM (precisa adicionar feature) |
| **Azure DNS** | Migração futura | API Azure pra sincronizar A records |
| **NetBox** (caso queira federar) | Improvável | API bidirecional (sync de subnets/IPs) |
