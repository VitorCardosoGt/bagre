import { prisma } from '../db.js';
import { requireAdmin } from '../auth.js';
import { auditFromReq } from '../audit.js';
import {
  getConfig,
  testConnection,
  syncFromZabbix,
  invalidateSession,
} from '../integrations/zabbix.js';
import { stripDemoPinned } from '../demo-guard.js';

const SAFE_FIELDS = [
  'enabled',
  'url',
  'apiToken',
  'username',
  'password',
  'intervalMinutes',
  'groupFilter',
  'staleAfterDays',
];

function maskSecret(s) {
  if (!s) return s;
  return '••••••••' + String(s).slice(-4);
}

function safeView(cfg) {
  if (!cfg) return cfg;
  return {
    ...cfg,
    apiToken: cfg.apiToken ? maskSecret(cfg.apiToken) : null,
    password: cfg.password ? maskSecret(cfg.password) : null,
    hasApiToken: !!cfg.apiToken,
    hasPassword: !!cfg.password,
  };
}

export async function registerZabbixRoutes(app) {
  app.get('/api/admin/zabbix-config', { preHandler: requireAdmin }, async () => {
    const cfg = await getConfig();
    return safeView(cfg);
  });

  app.patch('/api/admin/zabbix-config', { preHandler: requireAdmin }, async (req) => {
    const body = req.body || {};
    const data = {};
    for (const f of SAFE_FIELDS) {
      if (f in body) data[f] = body[f];
    }
    // Skip masked values: only update secrets when caller sends fresh non-masked text.
    if (data.apiToken && String(data.apiToken).startsWith('••••')) delete data.apiToken;
    if (data.password && String(data.password).startsWith('••••')) delete data.password;
    if ('apiToken' in data && data.apiToken === '') data.apiToken = null;
    if ('password' in data && data.password === '') data.password = null;
    // Na demo, o alvo do Zabbix fica fixado (anti-SSRF): o visitante pode
    // alternar enabled/intervalo, mas não repointar url/credenciais.
    stripDemoPinned(data, ['url', 'username', 'password', 'apiToken']);
    const before = await getConfig();
    const after = await prisma.zabbixConfig.update({ where: { id: 1 }, data });
    invalidateSession();
    await auditFromReq(req, {
      entity: 'zabbix_config',
      entityId: 1,
      action: 'update',
      before: safeView(before),
      after: safeView(after),
    });
    return safeView(after);
  });

  app.post('/api/admin/zabbix-config/test', { preHandler: requireAdmin }, async () => {
    const cfg = await getConfig();
    const result = await testConnection(cfg);
    await prisma.zabbixConfig.update({
      where: { id: 1 },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? 'ok' : 'error',
        lastTestMessage: result.message,
      },
    });
    return result;
  });

  app.post('/api/admin/zabbix-config/sync', { preHandler: requireAdmin }, async (req, reply) => {
    const cfg = await getConfig();
    if (!cfg.url) {
      reply.code(400);
      return { error: 'configure a URL antes de sincronizar' };
    }
    try {
      const result = await syncFromZabbix({ ...cfg, enabled: true });
      await auditFromReq(req, {
        entity: 'zabbix_config',
        entityId: 1,
        action: 'sync',
        after: result,
      });
      return result;
    } catch (err) {
      reply.code(500);
      return { error: err.message };
    }
  });
}
