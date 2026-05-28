// Azure provider implementation
//
// Auth: Service Principal (App Registration) com OAuth2 client_credentials.
// Credenciais JSON:
//   { mode: "SERVICE_PRINCIPAL", tenantId, clientId, clientSecret }
//
// O subscriptionId da CloudAccount vem do campo `scope`.
//
// Permissões mínimas (role "Reader" na subscription resolve tudo, ou uma
// custom role com estes 4 actions):
//   Microsoft.Network/virtualNetworks/read
//   Microsoft.Network/virtualNetworks/subnets/read
//   Microsoft.Network/networkInterfaces/read
//   Microsoft.Network/publicIPAddresses/read
//
// REST API (sem SDK — apps/api/src/integrations/cloud/aws.js usa SDK porque
// o auth dance da AWS é complexo; o Azure é muito mais direto, então
// evitamos a dep gigante de @azure/arm-network + @azure/identity).

const ARM_BASE = 'https://management.azure.com';
const API_VERSION = '2023-09-01';
const TOKEN_TTL_BUFFER_MS = 5 * 60_000; // refresca 5min antes de expirar

export const name = 'azure';

// Cache de token in-memory por (tenantId + clientId).
const tokenCache = new Map();

function parseCredentials(credsJson) {
  let creds;
  try {
    creds = JSON.parse(credsJson);
  } catch {
    throw new Error('Azure credentials: invalid JSON');
  }
  const mode = creds.mode || 'SERVICE_PRINCIPAL';
  if (mode !== 'SERVICE_PRINCIPAL') {
    throw new Error(`Azure credentials: unsupported mode "${mode}"`);
  }
  const missing = ['tenantId', 'clientId', 'clientSecret'].filter((k) => !creds[k]);
  if (missing.length) {
    throw new Error(`Azure credentials: missing ${missing.join(', ')}`);
  }
  return {
    tenantId: creds.tenantId,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  };
}

/** Obtém token OAuth2 client_credentials. Cacheia até 5min antes de expirar. */
async function getToken(creds) {
  const key = `${creds.tenantId}:${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > TOKEN_TTL_BUFFER_MS) {
    return cached.accessToken;
  }
  const url = `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'https://management.azure.com/.default',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Azure auth falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  const expiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
  tokenCache.set(key, { accessToken: json.access_token, expiresAt });
  return json.access_token;
}

async function armGet(creds, path) {
  const token = await getToken(creds);
  const sep = path.includes('?') ? '&' : '?';
  const url = `${ARM_BASE}${path}${sep}api-version=${API_VERSION}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Azure ARM ${res.status} em ${path}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

/** Pagina via nextLink, retorna array combinado de `value`. */
async function armList(creds, path) {
  const all = [];
  let nextLink = null;
  let firstCall = true;
  while (firstCall || nextLink) {
    firstCall = false;
    let json;
    if (nextLink) {
      // nextLink já tem api-version embutido + token expirou? Reuse.
      const token = await getToken(creds);
      const res = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Azure ARM pagination ${res.status}`);
      json = await res.json();
    } else {
      json = await armGet(creds, path);
    }
    if (Array.isArray(json.value)) all.push(...json.value);
    nextLink = json.nextLink || null;
  }
  return all;
}

export async function validateCredentials(credsJson) {
  const creds = parseCredentials(credsJson);
  // Confirma que o token sai sem erro. NÃO valida acesso a subscription
  // aqui — isso é checado no primeiro sync (provedor não sabe qual scope).
  await getToken(creds);
  return { tenantId: creds.tenantId, clientId: creds.clientId, mode: 'SERVICE_PRINCIPAL' };
}

/** Lista VNets + subnets aninhadas no scope (subscription). */
export async function listSubnets(credsJson, _region, scope) {
  const creds = parseCredentials(credsJson);
  if (!scope) throw new Error('Azure listSubnets: scope (subscriptionId) é obrigatório');
  const vnets = await armList(
    creds,
    `/subscriptions/${encodeURIComponent(scope)}/providers/Microsoft.Network/virtualNetworks`,
  );
  const out = [];
  for (const vnet of vnets) {
    const vnetLocation = vnet.location;
    const props = vnet.properties || {};
    const subnets = props.subnets || [];
    for (const s of subnets) {
      const sp = s.properties || {};
      const cidr = sp.addressPrefix || (sp.addressPrefixes && sp.addressPrefixes[0]) || null;
      if (!cidr) continue;
      out.push({
        cloudResourceId: s.id,
        name: s.name || vnet.name,
        cidr,
        region: vnetLocation,
        metadata: {
          vnetId: vnet.id,
          vnetName: vnet.name,
          addressPrefixes: props.addressSpace?.addressPrefixes || [],
          provisioningState: sp.provisioningState,
          tags: vnet.tags || {},
        },
      });
    }
  }
  return out;
}

/** Lista NICs (private IPs) + Public IPs (incluindo não-associados — FinOps). */
export async function listIps(credsJson, _region, scope) {
  const creds = parseCredentials(credsJson);
  if (!scope) throw new Error('Azure listIps: scope (subscriptionId) é obrigatório');

  const subPath = `/subscriptions/${encodeURIComponent(scope)}/providers/Microsoft.Network`;
  const [nics, publicIps] = await Promise.all([
    armList(creds, `${subPath}/networkInterfaces`),
    armList(creds, `${subPath}/publicIPAddresses`),
  ]);

  const out = [];

  // 1) Private IPs nas NICs
  for (const nic of nics) {
    const np = nic.properties || {};
    const configs = np.ipConfigurations || [];
    for (const cfg of configs) {
      const cp = cfg.properties || {};
      if (!cp.privateIPAddress) continue;
      out.push({
        cloudResourceId: cfg.id || nic.id,
        address: cp.privateIPAddress,
        subnetCloudId: cp.subnet?.id || null,
        hostname: nic.tags?.Name || nic.name || null,
        kind: 'PRIVATE',
        metadata: {
          nicId: nic.id,
          nicName: nic.name,
          allocationMethod: cp.privateIPAllocationMethod,
          primary: cp.primary,
          virtualMachineId: np.virtualMachine?.id || null,
          attachedToPublicIpId: cp.publicIPAddress?.id || null,
          tags: nic.tags || {},
        },
      });
    }
  }

  // 2) Public IPs (associated e unassociated). Unassociated é o ouro do FinOps.
  for (const pip of publicIps) {
    const pp = pip.properties || {};
    if (!pp.ipAddress) continue; // Public IPs allocated mas sem endereço atribuído ainda — pula
    out.push({
      cloudResourceId: pip.id,
      address: pp.ipAddress,
      subnetCloudId: null, // public IPs no Azure não vivem em subnet
      hostname: pip.tags?.Name || pip.name || null,
      kind: 'PUBLIC',
      metadata: {
        publicIpId: pip.id,
        publicIpName: pip.name,
        allocationMethod: pp.publicIPAllocationMethod, // Static | Dynamic
        sku: pip.sku?.name, // Basic | Standard
        associated: !!pp.ipConfiguration,
        ipConfigurationId: pp.ipConfiguration?.id || null,
        location: pip.location,
        tags: pip.tags || {},
      },
    });
  }

  return out;
}
