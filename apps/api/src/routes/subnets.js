import { prisma } from '../db.js';
import { expandCidr, normalizeAddress, detectIpVersion } from '../cidr.js';
import { auditFromReq } from '../audit.js';
import { snapshotSubnet } from '../integrations/utilization-snapshot.js';

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
      // Subnet IPv6 não pré-enumera; ipv4 esgotada — ambos retornam vazio.
      const subnet = await prisma.subnet.findUnique({ where: { id }, select: { cidr: true } });
      const isV6 = subnet?.cidr && detectIpVersion(subnet.cidr) === 6;
      reply.code(404);
      return {
        error: isV6
          ? 'subnet IPv6 não pré-enumera. Use POST /api/subnets/:id/ips para criar um endereço específico.'
          : 'nenhum IP livre nesta subnet',
      };
    }
    return next;
  });

  // POST /api/subnets/:id/ips — cria um IP ad-hoc na subnet.
  // Único caminho viável para subnets IPv6 (que NÃO pré-enumeram).
  // Também funciona em subnets v4 — útil pra adicionar IPs fora do range
  // calculado (ex: secondary IPs em interfaces multi-tap).
  app.post('/api/subnets/:id/ips', async (req, reply) => {
    const id = Number(req.params.id);
    const { address, hostname, type, function: fn, status, notes } = req.body || {};
    if (!address || !String(address).trim()) {
      reply.code(400);
      return { error: 'address é obrigatório' };
    }
    const normalized = normalizeAddress(String(address).trim());
    const subnet = await prisma.subnet.findUnique({ where: { id } });
    if (!subnet) {
      reply.code(404);
      return { error: 'subnet não encontrada' };
    }
    try {
      const ip = await prisma.ipAddress.create({
        data: {
          subnetId: id,
          address: normalized,
          hostname: hostname || null,
          type: type || null,
          function: fn || null,
          notes: notes || null,
          status: status || (hostname || type || fn ? 'USED' : 'FREE'),
        },
      });
      await auditFromReq(req, {
        entity: 'ip',
        entityId: ip.id,
        action: 'create',
        after: ip,
      });
      return ip;
    } catch (err) {
      if (err.code === 'P2002') {
        reply.code(409);
        return { error: `IP ${normalized} já existe nesta subnet` };
      }
      throw err;
    }
  });

  app.get('/api/subnets/:id/utilization-history', async (req) => {
    const id = Number(req.params.id);
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const rows = await prisma.subnetUtilizationSnapshot.findMany({
      where: { subnetId: id, takenAt: { gte: since } },
      orderBy: { takenAt: 'asc' },
      select: {
        id: true,
        takenAt: true,
        ipCount: true,
        usedCount: true,
        reservedCount: true,
        freeCount: true,
      },
    });
    return {
      subnetId: id,
      sinceDays: days,
      count: rows.length,
      snapshots: rows,
    };
  });

  // Captura snapshot agora (sem esperar o scheduler) — útil pra UI mostrar
  // dado fresco depois de uma operação em lote.
  app.post('/api/subnets/:id/utilization-snapshot', async (req) => {
    const id = Number(req.params.id);
    const r = await snapshotSubnet(id);
    return r;
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
        // expandCidr retorna [] para IPv6 — subnet é criada sem pré-enumeração.
        // Operador adiciona IPs específicos via POST /api/subnets/:id/ips.
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
