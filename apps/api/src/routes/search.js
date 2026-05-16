import { prisma } from '../db.js';

export async function registerSearch(app) {
  app.get('/api/search', async (req) => {
    const { q } = req.query || {};
    if (!q || q.length < 2) return { ips: [], subnets: [], sites: [] };

    const [ips, subnets, sites] = await Promise.all([
      prisma.ipAddress.findMany({
        where: {
          OR: [
            { address: { contains: q } },
            { hostname: { contains: q, mode: 'insensitive' } },
            { type: { contains: q, mode: 'insensitive' } },
            { function: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 30,
        include: { subnet: { include: { site: true } } },
      }),
      prisma.subnet.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { cidr: { contains: q } },
            { cidrLabel: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 20,
        include: { site: true },
      }),
      prisma.site.findMany({
        where: {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    ]);

    return { ips, subnets, sites };
  });
}
