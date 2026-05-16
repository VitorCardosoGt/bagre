import { prisma } from '../db.js';
import { expandCidr } from '../cidr.js';
import { auditFromReq } from '../audit.js';

export async function registerSubnets(app) {
  app.get('/api/subnets/:id', async (req) => {
    const id = Number(req.params.id);
    const subnet = await prisma.subnet.findUnique({
      where: { id },
      include: { site: true, _count: { select: { ips: true } } },
    });
    if (!subnet) return null;
    const used = await prisma.ipAddress.count({
      where: { subnetId: id, status: { not: 'FREE' } },
    });
    return { ...subnet, usedCount: used, ipCount: subnet._count.ips };
  });

  app.get('/api/subnets/:id/next-free-ip', async (req, reply) => {
    const id = Number(req.params.id);
    const next = await prisma.ipAddress.findFirst({
      where: { subnetId: id, status: 'FREE' },
      orderBy: { id: 'asc' },
      select: { id: true, address: true, subnetId: true, status: true },
    });
    if (!next) {
      reply.code(404);
      return { error: 'nenhum IP livre nesta subnet' };
    }
    return next;
  });

  app.get('/api/subnets/:id/ips', async (req) => {
    const id = Number(req.params.id);
    const { q, status } = req.query || {};
    const where = { subnetId: id };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { address: { contains: q } },
        { hostname: { contains: q, mode: 'insensitive' } },
        { type: { contains: q, mode: 'insensitive' } },
        { function: { contains: q, mode: 'insensitive' } },
      ];
    }
    const ips = await prisma.ipAddress.findMany({
      where,
      orderBy: { id: 'asc' },
    });
    return ips;
  });

  app.post('/api/subnets', async (req, reply) => {
    const { siteId, name, cidr, cidrLabel, vlanId, description } = req.body || {};
    if (!siteId || !name) {
      reply.code(400);
      return { error: 'siteId e name são obrigatórios' };
    }
    let addresses = [];
    if (cidr) {
      try {
        addresses = expandCidr(cidr);
      } catch (err) {
        reply.code(400);
        return { error: err.message };
      }
    }
    const subnet = await prisma.subnet.create({
      data: {
        siteId: Number(siteId),
        name,
        cidr: cidr || null,
        cidrLabel: cidrLabel || null,
        vlanId: vlanId ? Number(vlanId) : null,
        description: description || null,
      },
    });
    if (addresses.length) {
      await prisma.ipAddress.createMany({
        data: addresses.map((address) => ({ subnetId: subnet.id, address })),
        skipDuplicates: true,
      });
    }
    await auditFromReq(req, {
      entity: 'subnet',
      entityId: subnet.id,
      action: 'create',
      after: { ...subnet, ipsCreated: addresses.length },
    });
    return { ...subnet, ipsCreated: addresses.length };
  });

  app.patch('/api/subnets/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.subnet.findUnique({ where: { id } });
    const after = await prisma.subnet.update({ where: { id }, data: req.body || {} });
    await auditFromReq(req, { entity: 'subnet', entityId: id, action: 'update', before, after });
    return after;
  });

  app.delete('/api/subnets/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.subnet.findUnique({
      where: { id },
      include: { _count: { select: { ips: true } } },
    });
    await prisma.subnet.delete({ where: { id } });
    await auditFromReq(req, { entity: 'subnet', entityId: id, action: 'delete', before });
    return { ok: true };
  });
}
