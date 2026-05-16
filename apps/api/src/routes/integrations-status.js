import { prisma } from '../db.js';
import { requireAdmin } from '../auth.js';
import { testConnection as testZabbix, getConfig as getZabbixCfg, isConfigured as isZabbixConfigured } from '../integrations/zabbix.js';
import { getConfig as getOidcCfg, isConfigured as isOidcConfigured, testDiscovery as testOidc } from '../auth-providers/oidc.js';

function ageMs(date) {
  if (!date) return null;
  return Date.now() - new Date(date).getTime();
}

async function zabbixStatus() {
  const cfg = await getZabbixCfg();
  const configured = isZabbixConfigured(cfg);
  const ipsTouched = await prisma.ipAddress.count({ where: { lastSeenSource: 'zabbix' } });
  return {
    key: 'zabbix',
    name: 'Zabbix',
    icon: '📡',
    description: 'Sincroniza hosts monitorados como IPs no IPAM. Detecta stale e fantasmas.',
    configured,
    enabled: cfg.enabled,
    lastTest: cfg.lastTestedAt
      ? { at: cfg.lastTestedAt, ok: cfg.lastTestStatus === 'ok', message: cfg.lastTestMessage }
      : null,
    lastSync: cfg.lastSyncAt
      ? { at: cfg.lastSyncAt, ok: cfg.lastSyncStatus === 'ok', message: cfg.lastSyncMessage, stats: cfg.lastSyncStats }
      : null,
    ipsTouched,
    intervalMinutes: cfg.intervalMinutes,
    configUrl: '/admin/integrations/zabbix',
    healthEndpoint: '/api/admin/zabbix-config/test',
  };
}

async function oidcStatus() {
  const cfg = await getOidcCfg();
  const configured = isOidcConfigured(cfg);
  return {
    key: 'oidc',
    name: 'Microsoft Entra ID (SSO)',
    icon: '🔑',
    description: 'Login corporativo via OIDC. Permite login com conta Microsoft.',
    configured,
    enabled: cfg.enabled,
    lastTest: cfg.lastTestedAt
      ? { at: cfg.lastTestedAt, ok: cfg.lastTestStatus === 'ok', message: cfg.lastTestMessage }
      : null,
    configUrl: '/admin/sso',
    healthEndpoint: '/api/admin/oidc-config/test',
  };
}

function deriveOverall(integrations) {
  const errors = integrations.filter(
    (i) => i.enabled && (i.lastTest?.ok === false || i.lastSync?.ok === false),
  );
  if (errors.length) return { tone: 'error', label: 'Atenção · com erros' };
  const enabled = integrations.filter((i) => i.enabled && i.configured).length;
  if (enabled === 0) {
    const anyConfigured = integrations.some((i) => i.configured);
    return anyConfigured
      ? { tone: 'warn', label: 'Configurado mas pausado' }
      : { tone: 'idle', label: 'Nenhuma integração ativa' };
  }
  // Stale check: any enabled integration without recent sync within 2× interval
  const stale = integrations.find((i) => {
    if (!i.enabled) return false;
    if (!i.lastSync?.at) return true;
    const age = ageMs(i.lastSync.at);
    const limit = (i.intervalMinutes || 15) * 60_000 * 2;
    return age > limit;
  });
  if (stale) return { tone: 'warn', label: 'Sincronização atrasada' };
  return { tone: 'ok', label: 'Tudo operando' };
}

export async function registerIntegrationsStatusRoutes(app) {
  app.get('/api/admin/integrations/status', { preHandler: requireAdmin }, async () => {
    const [zabbix, oidc, events] = await Promise.all([
      zabbixStatus(),
      oidcStatus(),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: 'zabbix_config' },
            { entity: 'oidc_config' },
            { entity: 'user', action: 'login' },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);
    const integrations = [zabbix, oidc];
    const overall = deriveOverall(integrations);
    return { overall, integrations, events };
  });
}
