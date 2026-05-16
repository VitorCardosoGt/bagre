import { prisma } from '../db.js';
import { auditFromReq } from '../audit.js';

export async function registerSites(app) {
  app.get('/api/sites', async () => {
    const sites = await prisma.site.findMany({
      orderBy: { code: 'asc' },
      include: {
        subnets: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { ips: true } } },
        },
      },
    });
    // Compute used count per subnet
    const subnetIds = sites.flatMap((s) => s.subnets.map((sub) => sub.id));
    const usedRows = await prisma.ipAddress.groupBy({
      by: ['subnetId'],
      where: { subnetId: { in: subnetIds }, status: { not: 'FREE' } },
      _count: { _all: true },
    });
    const usedMap = new Map(usedRows.map((r) => [r.subnetId, r._count._all]));
    return sites.map((s) => ({
      ...s,
      subnets: s.subnets.map((sub) => ({
        id: sub.id,
        name: sub.name,
        cidr: sub.cidr,
        cidrLabel: sub.cidrLabel,
        vlanId: sub.vlanId,
        description: sub.description,
        ipCount: sub._count.ips,
        usedCount: usedMap.get(sub.id) || 0,
      })),
    }));
  });

  app.get('/api/sites/:id', async (req) => {
    const id = Number(req.params.id);
    return prisma.site.findUnique({ where: { id } });
  });

  app.get('/api/sites/:id/health', async (req, reply) => {
    const id = Number(req.params.id);
    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        subnets: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { ips: true } } },
        },
      },
    });
    if (!site) {
      return reply.code(404).send({ error: 'site not found' });
    }
    const subnetsWithoutIps = site.subnets
      .filter((s) => s._count.ips === 0)
      .map((s) => ({ id: s.id, name: s.name, cidr: s.cidr }));
    const subnetCount = site.subnets.length;
    const healthy = subnetsWithoutIps.length === 0;
    const result = {
      siteId: site.id,
      code: site.code,
      name: site.name,
      healthy,
      subnetCount,
      subnetsWithoutIps,
    };
    if (subnetCount === 0) result.note = 'site has no subnets';
    return result;
  });

  app.post('/api/sites', async (req) => {
    const { code, name, description } = req.body || {};
    const created = await prisma.site.create({ data: { code, name, description } });
    await auditFromReq(req, { entity: 'site', entityId: created.id, action: 'create', after: created });
    return created;
  });

  app.patch('/api/sites/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.site.findUnique({ where: { id } });
    const after = await prisma.site.update({ where: { id }, data: req.body || {} });
    await auditFromReq(req, { entity: 'site', entityId: id, action: 'update', before, after });
    return after;
  });

  app.delete('/api/sites/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.site.findUnique({ where: { id }, include: { subnets: true } });
    await prisma.site.delete({ where: { id } });
    await auditFromReq(req, { entity: 'site', entityId: id, action: 'delete', before });
    return { ok: true };
  });
}
