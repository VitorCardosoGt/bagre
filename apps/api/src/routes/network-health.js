import { prisma } from '../db.js';
import { requireAdmin } from '../auth.js';
import { getConfig as getZabbixConfig } from '../integrations/zabbix.js';

export async function registerNetworkHealthRoutes(app) {
  app.get('/api/network-health', { preHandler: requireAdmin }, async () => {
    const zcfg = await getZabbixConfig();
    const days = zcfg?.staleAfterDays || 7;
    const staleSince = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Stale: USED but lastSeenAt is older than threshold (or null while having data)
    const stale = await prisma.ipAddress.findMany({
      where: {
        status: 'USED',
        OR: [
          { lastSeenAt: { lt: staleSince } },
          { AND: [{ lastSeenAt: null }, { hostname: { not: null } }] },
        ],
      },
      orderBy: [{ lastSeenAt: 'asc' }, { id: 'asc' }],
      take: 100,
      include: { subnet: { include: { site: true } } },
    });

    // Conflict: marked CONFLICT
    const conflicts = await prisma.ipAddress.findMany({
      where: { status: 'CONFLICT' },
      take: 100,
      include: { subnet: { include: { site: true } } },
    });

    // Counters by lastSeenSource (to spot if Zabbix is feeding us)
    const sources = await prisma.ipAddress.groupBy({
      by: ['lastSeenSource'],
      _count: { _all: true },
      where: { lastSeenSource: { not: null } },
    });

    return {
      staleAfterDays: days,
      stale: stale.map((ip) => ({
        id: ip.id,
        address: ip.address,
        hostname: ip.hostname,
        type: ip.type,
        function: ip.function,
        lastSeenAt: ip.lastSeenAt,
        lastSeenSource: ip.lastSeenSource,
        site: ip.subnet?.site?.code,
        subnet: ip.subnet?.name,
        subnetId: ip.subnetId,
      })),
      conflicts: conflicts.map((ip) => ({
        id: ip.id,
        address: ip.address,
        hostname: ip.hostname,
        site: ip.subnet?.site?.code,
        subnet: ip.subnet?.name,
        subnetId: ip.subnetId,
      })),
      sources: sources.map((s) => ({ source: s.lastSeenSource, count: s._count._all })),
    };
  });
}
