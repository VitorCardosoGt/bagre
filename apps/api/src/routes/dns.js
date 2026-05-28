// DNS integration routes — admin-gated.
// V1 suporta PowerDNS; outros providers (BIND/Route53/Cloudflare) entram
// via switch no `cfg.provider`.

import { prisma } from '../db.js';
import { requireAdmin } from '../auth.js';
import { auditFromReq } from '../audit.js';
import * as powerdns from '../integrations/dns/powerdns.js';

const PROVIDERS = { powerdns };

const SAFE_FIELDS = [
  'enabled',
  'provider',
  'baseUrl',
  'apiKey',
  'serverId',
  'defaultZone',
  'intervalMinutes',
];

function maskSecret(s) {
  if (!s) return s;
  return '••••••••' + String(s).slice(-4);
}

function safeView(cfg) {
  if (!cfg) return cfg;
  return {
    ...cfg,
    apiKey: cfg.apiKey ? maskSecret(cfg.apiKey) : null,
    hasApiKey: !!cfg.apiKey,
  };
}

async function getCfg() {
  let cfg = await prisma.dnsConfig.findUnique({ where: { id: 1 } });
  if (!cfg) cfg = await prisma.dnsConfig.create({ data: { id: 1 } });
  return cfg;
}

function getProvider(cfg) {
  const p = PROVIDERS[cfg.provider || 'powerdns'];
  if (!p) throw new Error(`DNS provider não suportado: ${cfg.provider}`);
  return p;
}

export async function registerDnsRoutes(app) {
  app.get('/api/admin/dns-config', { preHandler: requireAdmin }, async () => {
    const cfg = await getCfg();
    return safeView(cfg);
  });

  app.patch('/api/admin/dns-config', { preHandler: requireAdmin }, async (req) => {
    const body = req.body || {};
    const data = {};
    for (const f of SAFE_FIELDS) {
      if (f in body) data[f] = body[f];
    }
    if (data.apiKey && String(data.apiKey).startsWith('••••')) delete data.apiKey;
    if ('apiKey' in data && data.apiKey === '') data.apiKey = null;
    const before = await getCfg();
    const after = await prisma.dnsConfig.update({ where: { id: 1 }, data });
    await auditFromReq(req, {
      entity: 'dns_config',
      entityId: 1,
      action: 'update',
      before: safeView(before),
      after: safeView(after),
    });
    return safeView(after);
  });

  app.post('/api/admin/dns-config/test', { preHandler: requireAdmin }, async () => {
    const cfg = await getCfg();
    const provider = getProvider(cfg);
    const result = await provider.testConnection(cfg);
    await prisma.dnsConfig.update({
      where: { id: 1 },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? 'ok' : 'error',
        lastTestMessage: result.message,
      },
    });
    return result;
  });

  // Preview do diff (sem aplicar) — útil pra UI mostrar "vou criar X, atualizar Y, deletar Z"
  app.get('/api/admin/dns-config/preview', { preHandler: requireAdmin }, async (req, reply) => {
    const cfg = await getCfg();
    const provider = getProvider(cfg);
    if (!provider.isConfigured(cfg)) {
      reply.code(400);
      return { error: 'DNS não configurado (baseUrl, apiKey e defaultZone obrigatórios)' };
    }
    try {
      const preview = await provider.previewSync(prisma, cfg);
      return preview;
    } catch (err) {
      reply.code(500);
      return { error: err.message };
    }
  });

  // Aplica o sync de fato — envia PATCH à API do DNS
  app.post('/api/admin/dns-config/sync', { preHandler: requireAdmin }, async (req, reply) => {
    const cfg = await getCfg();
    const provider = getProvider(cfg);
    if (!provider.isConfigured(cfg)) {
      reply.code(400);
      return { error: 'DNS não configurado' };
    }
    try {
      const result = await provider.applySync(prisma, cfg);
      await prisma.dnsConfig.update({
        where: { id: 1 },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: result.ok ? 'ok' : 'error',
          lastSyncMessage: `aplicado ${result.applied} RRsets (created=${result.toCreate.length}, updated=${result.toUpdate.length}, deleted=${result.toDelete.length})`,
          lastSyncStats: {
            applied: result.applied,
            created: result.toCreate.length,
            updated: result.toUpdate.length,
            deleted: result.toDelete.length,
          },
        },
      });
      await auditFromReq(req, {
        entity: 'dns_config',
        entityId: 1,
        action: 'sync',
        after: {
          applied: result.applied,
          created: result.toCreate.length,
          updated: result.toUpdate.length,
          deleted: result.toDelete.length,
        },
      });
      return result;
    } catch (err) {
      reply.code(500);
      return { error: err.message };
    }
  });
}
