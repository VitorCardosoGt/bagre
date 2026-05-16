// Zabbix integration. Supports two auth modes:
//  - apiToken (Zabbix 5.4+): preferred. Sent as Authorization: Bearer header.
//  - username + password (older): logs in via user.login, caches the session.
//
// Reads `host.get` with interfaces and groups, normalizes each interface IP into
// a "discovery" and pushes them through the existing /api/ingest pipeline.

import { prisma } from '../db.js';

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
let sessionAuth = null;
let sessionConfigSig = null;

export async function getConfig() {
  let cfg = await prisma.zabbixConfig.findUnique({ where: { id: 1 } });
  if (!cfg) cfg = await prisma.zabbixConfig.create({ data: { id: 1 } });
  return cfg;
}

export function isConfigured(cfg) {
  if (!cfg?.url) return false;
  return Boolean(cfg.apiToken || (cfg.username && cfg.password));
}

function configSig(cfg) {
  return [cfg.url, cfg.apiToken, cfg.username, cfg.password].join('|');
}

/** Low-level JSON-RPC call. Adds auth automatically when needed. */
async function rpc(cfg, method, params = {}, { needsAuth = true } = {}) {
  if (!cfg.url) throw new Error('Zabbix URL não configurada');
  const endpoint = cfg.url.replace(/\/$/, '') + '/api_jsonrpc.php';
  const headers = { 'Content-Type': 'application/json-rpc' };
  const body = {
    jsonrpc: '2.0',
    method,
    params,
    id: Date.now(),
  };
  if (needsAuth) {
    if (cfg.apiToken) {
      // Token vai no body em vez do header Authorization.
      // Zabbix 6.4 aceita ambos por default, mas várias instalações
      // têm o nginx removendo o header Authorization — body sempre funciona.
      body.auth = cfg.apiToken;
    } else {
      const auth = await ensureSession(cfg);
      body.auth = auth;
    }
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Zabbix HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(`Zabbix RPC: ${json.error.message} ${json.error.data || ''}`.trim());
  }
  return json.result;
}

async function ensureSession(cfg) {
  const sig = configSig(cfg);
  if (sessionAuth && sessionConfigSig === sig) return sessionAuth;
  if (!cfg.username || !cfg.password) {
    throw new Error('Sem token e sem usuário/senha — configure ao menos um');
  }
  const auth = await rpc(
    cfg,
    'user.login',
    { username: cfg.username, password: cfg.password },
    { needsAuth: false },
  );
  sessionAuth = auth;
  sessionConfigSig = sig;
  return auth;
}

/** Test connection with apiinfo.version (does not require auth). */
export async function testConnection(cfg) {
  if (!cfg?.url) return { ok: false, message: 'URL não configurada' };
  try {
    const version = await rpc(cfg, 'apiinfo.version', {}, { needsAuth: false });
    if (!isConfigured(cfg)) {
      return {
        ok: true,
        message: `Conexão OK · Zabbix ${version} (faltam credenciais para sincronizar)`,
        version,
      };
    }
    // Try an authenticated call to validate auth too
    await rpc(cfg, 'host.get', { countOutput: true, limit: 1 });
    return { ok: true, message: `Conexão e auth OK · Zabbix ${version}`, version };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/**
 * Decide um "tipo" amigável baseado no inventário e grupos do Zabbix.
 * Ordem de prioridade: inventory.type explícito → grupo → vendor/OS heurísticos.
 */
function deriveType(inv, groupNames) {
  const t = (inv.type || '').toLowerCase();
  const os = (inv.os || '').toLowerCase();
  const vendor = (inv.vendor || '').toLowerCase();
  const groups = groupNames.toLowerCase();

  if (t.includes('router') || groups.includes('router')) return 'Roteador';
  if (t.includes('switch') || groups.includes('switch')) return 'Switch';
  if (t.includes('firewall') || groups.includes('firewall')) return 'Firewall';
  if (t.includes('workstation') || groups.includes('workstations')) return 'Workstation';
  if (t.includes('printer')) return 'Impressora';
  if (t.includes('storage')) return 'Storage';
  if (os.includes('windows')) return 'Servidor Windows';
  if (os.includes('linux') || os.includes('ubuntu') || os.includes('debian') || os.includes('centos') || os.includes('rhel')) {
    return 'Servidor Linux';
  }
  if (vendor.includes('cisco')) return 'Equipamento Cisco';
  if (vendor.includes('mikrotik')) return 'Equipamento Mikrotik';
  if (vendor.includes('fortinet') || vendor.includes('fortigate')) return 'Firewall';
  return inv.type || 'Host';
}

function normalizeMac(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/[^0-9A-Fa-f]/g, '');
  if (cleaned.length !== 12) return s; // devolve original se não bater
  return cleaned.toUpperCase().match(/.{2}/g).join(':');
}

/** Fetch and normalize hosts. Returns the discovery payload our /ingest expects. */
export async function fetchHosts(cfg) {
  let groupids = undefined;
  if (cfg.groupFilter?.length) {
    const groups = await rpc(cfg, 'hostgroup.get', {
      output: ['groupid', 'name'],
      filter: { name: cfg.groupFilter },
    });
    groupids = groups.map((g) => g.groupid);
    if (!groupids.length) {
      throw new Error(`Nenhum grupo encontrado: ${cfg.groupFilter.join(', ')}`);
    }
  }

  const hosts = await rpc(cfg, 'host.get', {
    output: ['hostid', 'host', 'name', 'status'],
    selectInterfaces: ['ip', 'dns', 'type', 'main', 'available'],
    selectGroups: ['name'],
    selectInventory: 'extend',
    ...(groupids ? { groupids } : {}),
  });

  const discoveries = [];
  for (const h of hosts || []) {
    const groupNames = (h.groups || []).map((g) => g.name).join(', ');
    const inv = h.inventory && typeof h.inventory === 'object' ? h.inventory : {};
    const typeLabel = deriveType(inv, groupNames);
    const mac = normalizeMac(inv.macaddress_a) || normalizeMac(inv.macaddress_b);
    const osLabel = inv.os_full || inv.os_short || inv.os || null;
    const vendor = inv.vendor || null;
    const model = inv.model || null;
    for (const iface of h.interfaces || []) {
      const ip = iface.ip;
      if (!ip || !IPV4_RE.test(ip)) continue;
      discoveries.push({
        address: ip,
        hostname: h.name || h.host,
        type: typeLabel,
        function: groupNames || null,
        status: h.status === '0' ? 'USED' : 'RESERVED',
        source: 'zabbix',
        externalRef: `zabbix:host:${h.hostid}`,
        macAddress: mac,
        osInfo: osLabel,
        vendor,
        model,
      });
    }
  }
  return { discoveries, hostCount: hosts.length };
}

// Verifica se o IP é RFC1918 (privado). Filtra hosts públicos do Zabbix
// pra não poluir a fila de aprovação com monitor de internet.
function isPrivateIPv4(addr) {
  const parts = addr.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function suggestSubnet24(addr) {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/** Apply discoveries to IPAM in bulk. Returns counts. */
export async function applyDiscoveries(discoveries) {
  const stats = {
    received: discoveries.length,
    updated: 0,
    pendingCreated: 0,
    pendingUpdated: 0,
    skippedPublic: 0,
    skippedNoHostname: 0,
    ghosts: [],
    errors: [],
  };
  const now = new Date();
  for (const it of discoveries) {
    try {
      // Filtros: IP público OU sem hostname → não entra na fila
      if (!isPrivateIPv4(it.address)) {
        stats.skippedPublic++;
        continue;
      }
      if (!it.hostname || !String(it.hostname).trim()) {
        stats.skippedNoHostname++;
        continue;
      }

      const matches = await prisma.ipAddress.findMany({
        where: { address: it.address },
      });

      if (matches.length === 0) {
        // IP não está em nenhuma subnet do IPAM → fila de aprovação
        const sourceKey = 'zabbix';
        const pendingData = {
          source: sourceKey,
          address: it.address,
          externalRef: it.externalRef || null,
          hostname: it.hostname || null,
          type: it.type || null,
          vendor: it.vendor || null,
          model: it.model || null,
          osInfo: it.osInfo || null,
          macAddress: it.macAddress || null,
          function: it.function || null,
          suggestedSubnetCidr: suggestSubnet24(it.address),
          lastSeenAt: now,
        };
        const existing = await prisma.pendingDiscovery.findUnique({
          where: { source_address: { source: sourceKey, address: it.address } },
        });
        if (existing) {
          if (existing.status === 'PENDING') {
            await prisma.pendingDiscovery.update({
              where: { id: existing.id },
              data: { ...pendingData, occurrences: { increment: 1 } },
            });
            stats.pendingUpdated++;
          }
          // Se já foi APPROVED/REJECTED, não mexe (admin já decidiu)
        } else {
          await prisma.pendingDiscovery.create({ data: pendingData });
          stats.pendingCreated++;
        }
        stats.ghosts.push(it.address);
        continue;
      }

      // IP existe → atualizar (fluxo automático, sem aprovação)
      const data = {
        type: it.type || null,
        hostname: it.hostname || null,
        function: it.function || null,
        status: it.status || 'USED',
        macAddress: it.macAddress || null,
        osInfo: it.osInfo || null,
        vendor: it.vendor || null,
        model: it.model || null,
        lastSeenAt: now,
        lastSeenSource: 'zabbix',
        externalRef: it.externalRef || null,
      };
      for (const m of matches) {
        await prisma.ipAddress.update({ where: { id: m.id }, data });
      }
      stats.updated += matches.length;
    } catch (err) {
      stats.errors.push({ address: it.address, reason: err.message });
    }
  }
  return stats;
}

export async function syncFromZabbix(cfg) {
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };
  if (!isConfigured(cfg)) return { skipped: true, reason: 'incomplete config' };
  const t0 = Date.now();
  try {
    const { discoveries, hostCount } = await fetchHosts(cfg);
    const stats = await applyDiscoveries(discoveries);
    const result = {
      ok: true,
      durationMs: Date.now() - t0,
      hosts: hostCount,
      ...stats,
    };
    await prisma.zabbixConfig.update({
      where: { id: 1 },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ok',
        lastSyncMessage: `${result.updated} IPs atualizados, ${result.ghosts.length} fantasmas`,
        lastSyncStats: result,
      },
    });
    return result;
  } catch (err) {
    await prisma.zabbixConfig.update({
      where: { id: 1 },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncMessage: err.message,
      },
    });
    throw err;
  }
}

// ---- Scheduler ----
let timer = null;

async function tick(log) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled || !isConfigured(cfg)) return;
    const result = await syncFromZabbix(cfg);
    log?.info?.({ result }, 'zabbix sync done');
  } catch (err) {
    log?.warn?.({ err: err.message }, 'zabbix sync failed');
  }
}

export async function startScheduler(log) {
  if (timer) clearInterval(timer);
  const cfg = await getConfig();
  const minutes = Math.max(1, cfg.intervalMinutes || 15);
  // Initial run after 30s so we don't slow boot
  setTimeout(() => tick(log), 30_000);
  timer = setInterval(() => tick(log), minutes * 60_000);
  log?.info?.(`zabbix scheduler running every ${minutes}min`);
}

export function invalidateSession() {
  sessionAuth = null;
  sessionConfigSig = null;
}
