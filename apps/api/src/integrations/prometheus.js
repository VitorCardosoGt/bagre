// Prometheus discovery integration.
//
// Consome `GET /api/v1/targets?state=active` do Prometheus, extrai targets
// e seus labels, normaliza pro shape de discovery e empurra pro pipeline
// compartilhado (applyDiscoveries em ./discovery.js).
//
// Auth suportada:
//   - none    : URL sem autenticação (default da maioria das instalações)
//   - bearer  : Authorization: Bearer <token> (Prometheus atrás de oauth-proxy etc)
//   - basic   : Authorization: Basic <base64(user:pass)> (atrás de nginx basic)
//
// Mapping de labels Prometheus → campos do Bagre (v1, hardcoded):
//   __address__ ou instance label → IP (parte antes do `:` se for `host:port`)
//   instance label                 → hostname (se não for IP puro)
//   job label                      → type (derivado) + function
//
// Mapping configurável de labels pra campos custom vem em uma próxima iteração.

import { prisma } from '../db.js';
import { applyDiscoveries } from './discovery.js';

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const HOST_PORT_RE = /^(?<host>[^:\/]+)(?::(?<port>\d+))?$/;

export async function getConfig() {
  let cfg = await prisma.prometheusConfig.findUnique({ where: { id: 1 } });
  if (!cfg) cfg = await prisma.prometheusConfig.create({ data: { id: 1 } });
  return cfg;
}

export function isConfigured(cfg) {
  if (!cfg?.url) return false;
  if (cfg.authType === 'bearer' && !cfg.bearerToken) return false;
  if (cfg.authType === 'basic' && (!cfg.basicUsername || !cfg.basicPassword)) return false;
  return true;
}

function buildHeaders(cfg) {
  const headers = { Accept: 'application/json' };
  if (cfg.authType === 'bearer' && cfg.bearerToken) {
    headers.Authorization = `Bearer ${cfg.bearerToken}`;
  } else if (cfg.authType === 'basic' && cfg.basicUsername) {
    const enc = Buffer.from(`${cfg.basicUsername}:${cfg.basicPassword || ''}`).toString('base64');
    headers.Authorization = `Basic ${enc}`;
  }
  return headers;
}

async function promFetch(cfg, path) {
  const endpoint = cfg.url.replace(/\/$/, '') + path;
  const res = await fetch(endpoint, { headers: buildHeaders(cfg) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Prometheus HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  const json = await res.json();
  if (json.status !== 'success') {
    throw new Error(`Prometheus API status=${json.status}: ${json.error || ''}`);
  }
  return json.data;
}

/** Test connection by hitting /api/v1/status/buildinfo (não exige permissões especiais). */
export async function testConnection(cfg) {
  if (!cfg?.url) return { ok: false, message: 'URL não configurada' };
  try {
    const info = await promFetch(cfg, '/api/v1/status/buildinfo');
    return { ok: true, message: `Conexão OK · Prometheus ${info.version || '?'}`, version: info.version };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** Deriva o "tipo" de equipamento a partir do nome do job do Prometheus. */
function deriveTypeFromJob(job) {
  const j = (job || '').toLowerCase();
  if (j.includes('node') || j.includes('linux')) return 'Servidor Linux';
  if (j.includes('windows') || j.includes('wmi')) return 'Servidor Windows';
  if (j.includes('snmp') || j.includes('switch')) return 'Switch';
  if (j.includes('router')) return 'Roteador';
  if (j.includes('firewall')) return 'Firewall';
  if (j.includes('kubernetes') || j.includes('k8s')) return 'Container host';
  if (j.includes('cadvisor') || j.includes('docker')) return 'Container host';
  return job || 'Host';
}

/** Extrai IP de um label `instance` no formato `host:port` ou `host`. */
function parseInstance(instance) {
  if (!instance) return { ip: null, hostname: null };
  const m = HOST_PORT_RE.exec(instance);
  if (!m) return { ip: null, hostname: instance };
  const host = m.groups.host;
  if (IPV4_RE.test(host)) return { ip: host, hostname: null };
  return { ip: null, hostname: host };
}

/** Fetch targets do Prometheus e normaliza pro shape de discovery. */
export async function fetchTargets(cfg) {
  const data = await promFetch(cfg, '/api/v1/targets?state=active');
  const active = data.activeTargets || [];
  const discoveries = [];
  let skippedDown = 0;
  let skippedNoIp = 0;
  const jobs = new Set();
  for (const t of active) {
    const labels = t.labels || {};
    const job = labels.job;
    if (cfg.jobFilter?.length && !cfg.jobFilter.includes(job)) continue;
    if (job) jobs.add(job);

    // Targets com health=down também entram (eles podem virar "ghosts" no fluxo
    // do Bagre via lastSeenAt antigo). Mas pulamos se health=unknown.
    if (t.health === 'unknown') {
      skippedDown++;
      continue;
    }

    const { ip: ipFromInstance, hostname: hostFromInstance } = parseInstance(labels.instance);
    // Alguns setups usam __address__ como IP; em activeTargets o equivalente
    // está em discoveredLabels.__address__ (antes do relabel).
    const addrLabel = t.discoveredLabels?.__address__ || labels.__address__;
    const { ip: ipFromAddr } = parseInstance(addrLabel);

    const ip = ipFromInstance || ipFromAddr;
    if (!ip) {
      skippedNoIp++;
      continue;
    }

    // Hostname: preferência (1) label custom "hostname", (2) parte non-IP do instance, (3) o IP
    const hostname = labels.hostname || labels.node || hostFromInstance || ip;

    discoveries.push({
      address: ip,
      hostname,
      type: deriveTypeFromJob(job),
      function: job || null,
      status: t.health === 'up' ? 'USED' : 'RESERVED',
      externalRef: `prometheus:job=${job || '?'}:instance=${labels.instance || ip}`,
      osInfo: labels.os || null,
      vendor: labels.vendor || null,
      model: labels.model || null,
      macAddress: null,
    });
  }
  return {
    discoveries,
    targetCount: active.length,
    jobs: Array.from(jobs).sort(),
    skippedDown,
    skippedNoIp,
  };
}

/** Sync end-to-end: fetch + apply + persist stats. */
export async function syncFromPrometheus(cfg) {
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };
  if (!isConfigured(cfg)) return { skipped: true, reason: 'incomplete config' };
  const t0 = Date.now();
  try {
    const { discoveries, targetCount, jobs, skippedDown, skippedNoIp } = await fetchTargets(cfg);
    const stats = await applyDiscoveries('prometheus', discoveries);
    const result = {
      ok: true,
      durationMs: Date.now() - t0,
      targets: targetCount,
      jobs,
      ...stats,
      skippedDown,
      skippedNoIp,
    };
    await prisma.prometheusConfig.update({
      where: { id: 1 },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ok',
        lastSyncMessage: `${result.updated} IPs atualizados, ${result.ghosts.length} fantasmas, ${result.targets} targets em ${jobs.length} jobs`,
        lastSyncStats: result,
      },
    });
    return result;
  } catch (err) {
    await prisma.prometheusConfig.update({
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
    const result = await syncFromPrometheus(cfg);
    log?.info?.({ result }, 'prometheus sync done');
  } catch (err) {
    log?.warn?.({ err: err.message }, 'prometheus sync failed');
  }
}

export async function startScheduler(log) {
  if (timer) clearInterval(timer);
  const cfg = await getConfig();
  const minutes = Math.max(1, cfg.intervalMinutes || 15);
  // Initial run after 60s pra não brigar com Zabbix scheduler no boot
  setTimeout(() => tick(log), 60_000);
  timer = setInterval(() => tick(log), minutes * 60_000);
  log?.info?.(`prometheus scheduler running every ${minutes}min`);
}
