// GCP provider implementation
//
// Auth: Service Account JSON key (padrão para integrações externas).
// Credenciais JSON aceita o conteúdo bruto do arquivo de chave do
// service account — o mesmo JSON baixado do console:
//   {
//     "type": "service_account",
//     "project_id": "...",
//     "private_key_id": "...",
//     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
//     "client_email": "...@...iam.gserviceaccount.com",
//     "client_id": "...",
//     "auth_uri": "...",
//     "token_uri": "https://oauth2.googleapis.com/token",
//     ...
//   }
//
// O `project_id` do GCP vem do campo `scope` da CloudAccount, podendo
// diferir do project_id do JSON (a service account de um projeto X pode
// ter permissão de Reader no projeto Y).
//
// Permissões mínimas (role `roles/compute.networkViewer` resolve):
//   compute.subnetworks.list
//   compute.instances.list
//   compute.addresses.list
//
// Fluxo OAuth2 JWT bearer (RFC 7523):
//   1. Compor JWT { iss, scope, aud, iat, exp } assinado RS256 com private_key.
//   2. POST no token_uri com grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer.
//   3. Receber access_token (1h) e cachear in-memory.

import crypto from 'node:crypto';

const API_BASE = 'https://compute.googleapis.com/compute/v1';
const SCOPE = 'https://www.googleapis.com/auth/compute.readonly';
const TOKEN_TTL_BUFFER_MS = 5 * 60_000;

export const name = 'gcp';

const tokenCache = new Map(); // key = client_email

function base64UrlEncode(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function parseCredentials(credsJson) {
  let creds;
  try {
    creds = JSON.parse(credsJson);
  } catch {
    throw new Error('GCP credentials: invalid JSON');
  }
  const required = ['client_email', 'private_key', 'token_uri'];
  const missing = required.filter((k) => !creds[k]);
  if (missing.length) {
    throw new Error(`GCP credentials: missing ${missing.join(', ')}`);
  }
  return {
    client_email: creds.client_email,
    private_key: creds.private_key,
    token_uri: creds.token_uri,
    project_id: creds.project_id || null,
  };
}

function signJwt(creds) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    scope: SCOPE,
    aud: creds.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(creds.private_key);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getToken(creds) {
  const key = creds.client_email;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > TOKEN_TTL_BUFFER_MS) {
    return cached.accessToken;
  }
  const jwt = signJwt(creds);
  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GCP auth falhou (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  const expiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
  tokenCache.set(key, { accessToken: json.access_token, expiresAt });
  return json.access_token;
}

async function gcpGet(creds, path) {
  const token = await getToken(creds);
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GCP ${res.status} em ${path}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

/** Pagina através de `nextPageToken`, agregando `items` (aggregated endpoints). */
async function gcpAggregated(creds, path) {
  const items = {};
  let pageToken = null;
  do {
    const url = `${path}${pageToken ? (path.includes('?') ? '&' : '?') + `pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const json = await gcpGet(creds, url);
    if (json.items) {
      for (const [k, v] of Object.entries(json.items)) {
        items[k] = items[k] ? [...items[k], ...(v.subnetworks || v.instances || v.addresses || [])] : (v.subnetworks || v.instances || v.addresses || []);
      }
    }
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  return items;
}

export async function validateCredentials(credsJson) {
  const creds = parseCredentials(credsJson);
  await getToken(creds);
  return {
    client_email: creds.client_email,
    project_id: creds.project_id,
    mode: 'SERVICE_ACCOUNT',
  };
}

/** Region from `regions/us-central1` key prefix → us-central1. */
function regionFromKey(key) {
  if (!key) return null;
  return key.replace(/^regions\//, '').replace(/^zones\//, '');
}

export async function listSubnets(credsJson, _region, scope) {
  const creds = parseCredentials(credsJson);
  if (!scope) throw new Error('GCP listSubnets: scope (project_id) é obrigatório');
  const grouped = await gcpAggregated(
    creds,
    `/projects/${encodeURIComponent(scope)}/aggregated/subnetworks`,
  );
  const out = [];
  for (const [scopeKey, subnetworks] of Object.entries(grouped)) {
    const region = regionFromKey(scopeKey);
    for (const s of subnetworks) {
      if (!s.ipCidrRange) continue;
      out.push({
        cloudResourceId: s.selfLink || s.id,
        name: s.name,
        cidr: s.ipCidrRange,
        region,
        metadata: {
          network: s.network,
          gatewayAddress: s.gatewayAddress,
          privateIpGoogleAccess: s.privateIpGoogleAccess,
          purpose: s.purpose,
          stackType: s.stackType,
          secondaryIpRanges: s.secondaryIpRanges || [],
        },
      });
    }
  }
  return out;
}

export async function listIps(credsJson, _region, scope) {
  const creds = parseCredentials(credsJson);
  if (!scope) throw new Error('GCP listIps: scope (project_id) é obrigatório');

  // Roda em paralelo: instâncias (private+ephemeral public) e endereços reservados (static)
  const [instanceGroups, addressGroups] = await Promise.all([
    gcpAggregated(creds, `/projects/${encodeURIComponent(scope)}/aggregated/instances`),
    gcpAggregated(creds, `/projects/${encodeURIComponent(scope)}/aggregated/addresses`),
  ]);

  const out = [];

  // 1) IPs de NICs de instâncias
  for (const [scopeKey, instances] of Object.entries(instanceGroups)) {
    const zone = regionFromKey(scopeKey);
    for (const inst of instances) {
      const nics = inst.networkInterfaces || [];
      for (const nic of nics) {
        // Private IP
        if (nic.networkIP) {
          out.push({
            cloudResourceId: `${inst.selfLink}/networkInterfaces/${nic.name || '0'}`,
            address: nic.networkIP,
            subnetCloudId: nic.subnetwork || null,
            hostname: inst.name,
            kind: 'PRIVATE',
            metadata: {
              instanceId: inst.id,
              instanceName: inst.name,
              instanceSelfLink: inst.selfLink,
              zone,
              status: inst.status,
              machineType: inst.machineType,
              nic: nic.name,
              labels: inst.labels || {},
            },
          });
        }
        // Public IPs (accessConfigs → natIP — ephemeral OU statically attached)
        for (const ac of nic.accessConfigs || []) {
          if (!ac.natIP) continue;
          out.push({
            cloudResourceId: `${inst.selfLink}/accessConfigs/${ac.name || 'External NAT'}`,
            address: ac.natIP,
            subnetCloudId: null,
            hostname: inst.name,
            kind: 'PUBLIC',
            metadata: {
              instanceName: inst.name,
              zone,
              accessConfigName: ac.name,
              externalIpv6: ac.externalIpv6,
              setPublicPtr: ac.setPublicPtr,
              isStatic: false,
              associated: true,
            },
          });
        }
      }
    }
  }

  // 2) Endereços reservados (static) — INTERNAL e EXTERNAL.
  //    Os EXTERNAL com `users: []` ou status=RESERVED sem uso = idle = FinOps gold.
  for (const [scopeKey, addresses] of Object.entries(addressGroups)) {
    const region = regionFromKey(scopeKey);
    for (const addr of addresses) {
      if (!addr.address) continue;
      const isExternal = addr.addressType === 'EXTERNAL' || !addr.addressType;
      const associated = Array.isArray(addr.users) && addr.users.length > 0;
      out.push({
        cloudResourceId: addr.selfLink || addr.id,
        address: addr.address,
        subnetCloudId: addr.subnetwork || null,
        hostname: addr.name,
        kind: isExternal ? 'PUBLIC' : 'PRIVATE',
        metadata: {
          addressName: addr.name,
          addressType: addr.addressType,
          status: addr.status, // RESERVED | IN_USE
          purpose: addr.purpose,
          region,
          users: addr.users || [],
          associated,
          isStatic: true,
          ipVersion: addr.ipVersion,
          labels: addr.labels || {},
        },
      });
    }
  }

  return out;
}
