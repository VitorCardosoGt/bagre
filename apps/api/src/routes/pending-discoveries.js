import { prisma } from '../db.js';
import { auditFromReq } from '../audit.js';
import { expandCidr } from '../cidr.js';

export async function registerPendingDiscoveries(app) {
  app.get('/api/pending-discoveries', async (req) => {
    const { status, source, suggestedSubnet, q } = req.query || {};
    const where = {};
    if (status) where.status = status;
    if (source) where.source = source;
    if (suggestedSubnet) where.suggestedSubnetCidr = suggestedSubnet;
    if (q) {
      where.OR = [
        { address: { contains: q } },
        { hostname: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
      ];
    }
    return prisma.pendingDiscovery.findMany({
      where,
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
    });
  });

  app.get('/api/pending-discoveries/stats', async () => {
    const grouped = await prisma.pendingDiscovery.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const out = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const g of grouped) out[g.status] = g._count._all;
    // Agrupar pendentes por subnet sugerida
    const bySubnet = await prisma.pendingDiscovery.groupBy({
      by: ['suggestedSubnetCidr'],
      where: { status: 'PENDING' },
      _count: { _all: true },
      orderBy: { _count: { suggestedSubnetCidr: 'desc' } },
    });
    return {
      counts: out,
      pendingBySubnet: bySubnet.map((b) => ({
        cidr: b.suggestedSubnetCidr,
        count: b._count._all,
      })),
    };
  });

  // Resolve/cria subnet alvo. Aceita subnetId existente OU newSubnet:{siteId,name,cidr}.
  async function resolveTargetSubnet(input) {
    if (input.subnetId) {
      const sub = await prisma.subnet.findUnique({ where: { id: Number(input.subnetId) } });
      if (!sub) throw new Error('subnet alvo não encontrada');
      return { subnet: sub, createdSubnet: false };
    }
    if (input.newSubnet) {
      const { siteId, name, cidr, cidrLabel, vlanId, description } = input.newSubnet;
      if (!siteId || !name || !cidr) {
        throw new Error('newSubnet exige siteId, name e cidr');
      }
      let addresses = [];
      try {
        addresses = expandCidr(cidr);
      } catch (err) {
        throw new Error(`CIDR inválido: ${err.message}`);
      }
      const sub = await prisma.subnet.create({
        data: {
          siteId: Number(siteId),
          name: String(name).trim(),
          cidr,
          cidrLabel: cidrLabel || cidr,
          vlanId: vlanId != null && vlanId !== '' ? Number(vlanId) : null,
          description: description || null,
        },
      });
      if (addresses.length) {
        await prisma.ipAddress.createMany({
          data: addresses.map((a) => ({ subnetId: sub.id, address: a })),
          skipDuplicates: true,
        });
      }
      return { subnet: sub, createdSubnet: true, ipsCreated: addresses.length };
    }
    throw new Error('informe subnetId (existente) ou newSubnet (novo)');
  }

  app.post('/api/pending-discoveries/:id/approve', async (req, reply) => {
    const id = Number(req.params.id);
    const pending = await prisma.pendingDiscovery.findUnique({ where: { id } });
    if (!pending) {
      reply.code(404);
      return { error: 'pending discovery não encontrada' };
    }
    if (pending.status !== 'PENDING') {
      reply.code(409);
      return { error: `discovery já está ${pending.status}` };
    }

    const body = req.body || {};
    let resolved;
    try {
      resolved = await resolveTargetSubnet(body);
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }

    // Localiza/cria o IpAddress dentro da subnet alvo
    let ip = await prisma.ipAddress.findUnique({
      where: { subnetId_address: { subnetId: resolved.subnet.id, address: pending.address } },
    });
    if (!ip) {
      // Pode acontecer se newSubnet foi criado com CIDR que não cobre o address
      // (raro — admin deve ter escolhido subnet certa). Cria o IP avulso.
      ip = await prisma.ipAddress.create({
        data: { subnetId: resolved.subnet.id, address: pending.address },
      });
    }

    // Cria ou reusa Device pelo hostname canônico
    let device = null;
    if (pending.hostname) {
      device = await prisma.device.findFirst({
        where: { name: { equals: pending.hostname, mode: 'insensitive' } },
      });
      if (!device) {
        device = await prisma.device.create({
          data: {
            name: pending.hostname,
            type: pending.type,
            vendor: pending.vendor,
            model: pending.model,
            osInfo: pending.osInfo,
            role: pending.function,
            siteId: resolved.subnet.siteId,
            externalRef: pending.externalRef,
            lastSeenAt: pending.lastSeenAt,
          },
        });
      }
    }

    // Popula o IP com os dados da discovery
    const ipAfter = await prisma.ipAddress.update({
      where: { id: ip.id },
      data: {
        deviceId: device?.id ?? null,
        hostname: pending.hostname,
        type: pending.type,
        function: pending.function,
        status: 'USED',
        macAddress: pending.macAddress,
        osInfo: pending.osInfo,
        vendor: pending.vendor,
        model: pending.model,
        lastSeenAt: pending.lastSeenAt,
        lastSeenSource: pending.source,
        externalRef: pending.externalRef,
      },
    });

    const updated = await prisma.pendingDiscovery.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedBy: req.user?.email || null,
        decidedAt: new Date(),
      },
    });

    await auditFromReq(req, {
      entity: 'pending_discovery',
      entityId: id,
      action: 'approve',
      before: pending,
      after: { ...updated, ipId: ipAfter.id, deviceId: device?.id, subnetCreated: resolved.createdSubnet },
    });

    return {
      ok: true,
      pending: updated,
      ip: ipAfter,
      device,
      subnetCreated: resolved.createdSubnet ? resolved.subnet : null,
    };
  });

  app.post('/api/pending-discoveries/:id/reject', async (req, reply) => {
    const id = Number(req.params.id);
    const pending = await prisma.pendingDiscovery.findUnique({ where: { id } });
    if (!pending) {
      reply.code(404);
      return { error: 'pending discovery não encontrada' };
    }
    if (pending.status !== 'PENDING') {
      reply.code(409);
      return { error: `discovery já está ${pending.status}` };
    }
    const { reason } = req.body || {};
    const updated = await prisma.pendingDiscovery.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedReason: reason ? String(reason).trim() : null,
        decidedBy: req.user?.email || null,
        decidedAt: new Date(),
      },
    });
    await auditFromReq(req, {
      entity: 'pending_discovery',
      entityId: id,
      action: 'reject',
      before: pending,
      after: updated,
    });
    return updated;
  });

  // Aprovação em lote: vários IDs apontando pra MESMA subnet (existente ou nova)
  app.post('/api/pending-discoveries/bulk-approve', async (req, reply) => {
    const { ids, subnetId, newSubnet } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      reply.code(400);
      return { error: 'ids[] obrigatório' };
    }

    let resolved;
    try {
      resolved = await resolveTargetSubnet({ subnetId, newSubnet });
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }

    const results = { approved: 0, skipped: [], errors: [] };
    for (const rawId of ids) {
      const id = Number(rawId);
      try {
        const pending = await prisma.pendingDiscovery.findUnique({ where: { id } });
        if (!pending || pending.status !== 'PENDING') {
          results.skipped.push(id);
          continue;
        }
        let ip = await prisma.ipAddress.findUnique({
          where: { subnetId_address: { subnetId: resolved.subnet.id, address: pending.address } },
        });
        if (!ip) {
          ip = await prisma.ipAddress.create({
            data: { subnetId: resolved.subnet.id, address: pending.address },
          });
        }
        let device = null;
        if (pending.hostname) {
          device = await prisma.device.findFirst({
            where: { name: { equals: pending.hostname, mode: 'insensitive' } },
          });
          if (!device) {
            device = await prisma.device.create({
              data: {
                name: pending.hostname,
                type: pending.type,
                vendor: pending.vendor,
                model: pending.model,
                osInfo: pending.osInfo,
                role: pending.function,
                siteId: resolved.subnet.siteId,
                externalRef: pending.externalRef,
                lastSeenAt: pending.lastSeenAt,
              },
            });
          }
        }
        await prisma.ipAddress.update({
          where: { id: ip.id },
          data: {
            deviceId: device?.id ?? null,
            hostname: pending.hostname,
            type: pending.type,
            function: pending.function,
            status: 'USED',
            macAddress: pending.macAddress,
            osInfo: pending.osInfo,
            vendor: pending.vendor,
            model: pending.model,
            lastSeenAt: pending.lastSeenAt,
            lastSeenSource: pending.source,
            externalRef: pending.externalRef,
          },
        });
        await prisma.pendingDiscovery.update({
          where: { id },
          data: {
            status: 'APPROVED',
            decidedBy: req.user?.email || null,
            decidedAt: new Date(),
          },
        });
        results.approved++;
      } catch (err) {
        results.errors.push({ id, reason: err.message });
      }
    }

    await auditFromReq(req, {
      entity: 'pending_discovery',
      entityId: 0,
      action: 'bulk_approve',
      after: {
        ids,
        subnetId: resolved.subnet.id,
        subnetCreated: resolved.createdSubnet,
        results,
      },
    });

    return {
      ok: true,
      ...results,
      subnetCreated: resolved.createdSubnet ? resolved.subnet : null,
    };
  });
}
