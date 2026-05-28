// PowerDNS provider — push hostnames do Bagre como A records numa zona.
//
// API ref: https://doc.powerdns.com/authoritative/http-api/
//   GET    /api/v1/servers/{server}/zones                      list zones
//   GET    /api/v1/servers/{server}/zones/{zone}               read zone + RRsets
//   PATCH  /api/v1/servers/{server}/zones/{zone}               update RRsets
//
// Auth via header X-API-Key (configurado em pdns.conf como api-key=...).
//
// Estratégia de sync:
//   - Lê todos os IPs do Bagre com status=USED e hostname não-vazio
//   - Constrói RRset esperado: <hostname>.<zone> A <ip> (TTL configurável)
//   - Compara com estado atual da zona
//   - PATCH com diff: { replace: [...] } pra adicionar/atualizar,
//     { delete: [...] } pra remover records órfãos (que foram criados
//     pelo Bagre antes mas o IP foi liberado)
//
// Records gerados pelo Bagre são marcados via comment `bagre-managed`
// pra evitar conflito com records criados manualmente fora do Bagre.

const DEFAULT_TTL = 300;
const BAGRE_COMMENT_PREFIX = 'bagre-managed';

export const name = 'powerdns';

function buildHeaders(cfg) {
  return {
    'X-API-Key': cfg.apiKey,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function normalizeZone(zone) {
  if (!zone) return zone;
  return zone.endsWith('.') ? zone : `${zone}.`;
}

async function pdnsGet(cfg, path) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { headers: buildHeaders(cfg) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PowerDNS GET ${res.status} ${path}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function pdnsPatch(cfg, path, body) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PowerDNS PATCH ${res.status} ${path}: ${t.slice(0, 300)}`);
  }
  return res.status === 204 ? { ok: true } : res.json();
}

export function isConfigured(cfg) {
  return Boolean(cfg?.baseUrl && cfg?.apiKey && cfg?.defaultZone);
}

export async function testConnection(cfg) {
  if (!cfg?.baseUrl || !cfg?.apiKey) {
    return { ok: false, message: 'baseUrl e apiKey são obrigatórios' };
  }
  try {
    const serverInfo = await pdnsGet(cfg, `/api/v1/servers/${cfg.serverId}`);
    let zoneOk = true;
    let zoneMsg = '';
    if (cfg.defaultZone) {
      try {
        const z = await pdnsGet(cfg, `/api/v1/servers/${cfg.serverId}/zones/${encodeURIComponent(normalizeZone(cfg.defaultZone))}`);
        zoneMsg = ` · zona ${z.name} OK (${(z.rrsets || []).length} RRsets)`;
      } catch (err) {
        zoneOk = false;
        zoneMsg = ` · zona ${cfg.defaultZone} NÃO encontrada: ${err.message}`;
      }
    }
    return {
      ok: zoneOk,
      message: `PowerDNS ${serverInfo.version || '?'}${zoneMsg}`,
      version: serverInfo.version,
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** Lê a zona inteira e devolve mapa `<fqdn>` → `{ ips, ttl, managedByBagre }`. */
async function readZoneState(cfg) {
  const zone = normalizeZone(cfg.defaultZone);
  const data = await pdnsGet(cfg, `/api/v1/servers/${cfg.serverId}/zones/${encodeURIComponent(zone)}`);
  const out = new Map();
  for (const rr of data.rrsets || []) {
    if (rr.type !== 'A') continue;
    const ips = (rr.records || []).filter((r) => !r.disabled).map((r) => r.content);
    const managedByBagre = (rr.comments || []).some((c) =>
      String(c.content || '').startsWith(BAGRE_COMMENT_PREFIX),
    );
    out.set(rr.name, { ips, ttl: rr.ttl, managedByBagre });
  }
  return { zone, current: out };
}

/**
 * Calcula a diferença entre o que o Bagre tem (hostname → IP) e o que está
 * na zona DNS. Retorna { toCreate, toUpdate, toDelete }.
 *
 * @param {string} zone — ex: "internal.empresa.local."
 * @param {Map<string, Set<string>>} bagreHostnames — fqdn → set of IPs
 * @param {Map<string, {ips:string[], managedByBagre:boolean}>} dnsState
 */
function diff(zone, bagreHostnames, dnsState) {
  const toCreate = []; // [{ fqdn, ips }]
  const toUpdate = []; // [{ fqdn, currentIps, newIps }]
  const toDelete = []; // [{ fqdn, currentIps }] — apenas records bagre-managed que sumiram

  for (const [fqdn, ips] of bagreHostnames.entries()) {
    const ipsArr = Array.from(ips).sort();
    const existing = dnsState.get(fqdn);
    if (!existing) {
      toCreate.push({ fqdn, ips: ipsArr });
    } else {
      const sameSet = JSON.stringify(existing.ips.sort()) === JSON.stringify(ipsArr);
      if (!sameSet) {
        toUpdate.push({ fqdn, currentIps: existing.ips, newIps: ipsArr });
      }
    }
  }
  for (const [fqdn, state] of dnsState.entries()) {
    if (!bagreHostnames.has(fqdn) && state.managedByBagre) {
      toDelete.push({ fqdn, currentIps: state.ips });
    }
  }
  return { zone, toCreate, toUpdate, toDelete };
}

/**
 * Constrói o mapa hostname→IPs a partir do estado atual do Bagre.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} zone — usado pra construir FQDN (<hostname>.<zone>)
 * @returns {Promise<Map<string, Set<string>>>} fqdn → set de IPs
 */
async function bagreHostnameMap(prisma, zone) {
  const ips = await prisma.ipAddress.findMany({
    where: { status: 'USED', hostname: { not: null } },
    select: { address: true, hostname: true },
  });
  const map = new Map();
  for (const it of ips) {
    if (!it.hostname || !it.hostname.trim()) continue;
    // Evita ".." se hostname já termina com . (vir como FQDN completo)
    const fqdn = it.hostname.endsWith('.')
      ? it.hostname
      : `${it.hostname}.${zone}`;
    if (!map.has(fqdn)) map.set(fqdn, new Set());
    map.get(fqdn).add(it.address);
  }
  return map;
}

/** Calcula e retorna preview do diff (sem aplicar). */
export async function previewSync(prisma, cfg) {
  const { zone, current } = await readZoneState(cfg);
  const bagre = await bagreHostnameMap(prisma, zone);
  return diff(zone, bagre, current);
}

/** Aplica o diff via PATCH. Retorna contadores + qualquer erro. */
export async function applySync(prisma, cfg) {
  const preview = await previewSync(prisma, cfg);
  const { zone, toCreate, toUpdate, toDelete } = preview;
  const rrsets = [];
  const ttl = DEFAULT_TTL;
  const bagreComment = [
    {
      account: 'bagre',
      content: `${BAGRE_COMMENT_PREFIX} · synced ${new Date().toISOString()}`,
    },
  ];

  for (const c of toCreate) {
    rrsets.push({
      name: c.fqdn,
      type: 'A',
      ttl,
      changetype: 'REPLACE',
      records: c.ips.map((content) => ({ content, disabled: false })),
      comments: bagreComment,
    });
  }
  for (const u of toUpdate) {
    rrsets.push({
      name: u.fqdn,
      type: 'A',
      ttl,
      changetype: 'REPLACE',
      records: u.newIps.map((content) => ({ content, disabled: false })),
      comments: bagreComment,
    });
  }
  for (const d of toDelete) {
    rrsets.push({
      name: d.fqdn,
      type: 'A',
      changetype: 'DELETE',
    });
  }

  if (rrsets.length === 0) {
    return { ok: true, applied: 0, ...preview };
  }

  await pdnsPatch(
    cfg,
    `/api/v1/servers/${cfg.serverId}/zones/${encodeURIComponent(zone)}`,
    { rrsets },
  );
  return { ok: true, applied: rrsets.length, ...preview };
}
