import { prisma } from '../db.js';

export async function registerStats(app) {
  app.get('/api/stats', async () => {
    const [siteCount, subnetCount, ipCount, used, reserved, recent] = await Promise.all([
      prisma.site.count(),
      prisma.subnet.count(),
      prisma.ipAddress.count(),
      prisma.ipAddress.count({ where: { status: 'USED' } }),
      prisma.ipAddress.count({ where: { status: 'RESERVED' } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    return {
      siteCount,
      subnetCount,
      ipCount,
      used,
      reserved,
      free: ipCount - used - reserved,
      recent,
    };
  });

  app.get('/api/stats/by-site', async () => {
    const sites = await prisma.site.findMany({
      orderBy: { code: 'asc' },
      include: {
        subnets: {
          include: {
            ips: { select: { status: true } },
          },
        },
      },
    });
    return sites.map((s) => {
      let total = 0;
      let used = 0;
      let reserved = 0;
      for (const sub of s.subnets) {
        for (const ip of sub.ips) {
          total++;
          if (ip.status === 'USED') used++;
          else if (ip.status === 'RESERVED') reserved++;
        }
      }
      return {
        siteId: s.id,
        code: s.code,
        name: s.name,
        subnetCount: s.subnets.length,
        total,
        used,
        reserved,
        free: total - used - reserved,
      };
    });
  });
}
