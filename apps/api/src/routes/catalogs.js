import { prisma } from '../db.js';
import { auditFromReq } from '../audit.js';

function pick(body, keys) {
  const data = {};
  for (const k of keys) {
    if (k in (body || {})) data[k] = body[k] === '' ? null : body[k];
  }
  return data;
}

export async function registerCatalogs(app) {
  // ============ MASTER RANGES ============
  app.get('/api/master-ranges', async () => {
    return prisma.masterRange.findMany({ orderBy: [{ category: 'asc' }, { cidr: 'asc' }] });
  });

  app.post('/api/master-ranges', async (req, reply) => {
    const { cidr, description, category } = req.body || {};
    if (!cidr || !String(cidr).trim()) {
      reply.code(400);
      return { error: 'cidr é obrigatório' };
    }
    try {
      const created = await prisma.masterRange.create({
        data: {
          cidr: String(cidr).trim(),
          description: description ? String(description).trim() : '',
          category: category ? String(category).trim() : null,
        },
      });
      await auditFromReq(req, {
        entity: 'master_range',
        entityId: created.id,
        action: 'create',
        after: created,
      });
      return created;
    } catch (e) {
      if (e.code === 'P2002') {
        reply.code(409);
        return { error: 'já existe um master range com esse cidr+descrição' };
      }
      throw e;
    }
  });

  app.patch('/api/master-ranges/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.masterRange.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'master range não encontrado' };
    }
    const data = pick(req.body, ['cidr', 'description', 'category']);
    const after = await prisma.masterRange.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'master_range',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.delete('/api/master-ranges/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.masterRange.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'master range não encontrado' };
    }
    await prisma.masterRange.delete({ where: { id } });
    await auditFromReq(req, {
      entity: 'master_range',
      entityId: id,
      action: 'delete',
      before,
    });
    return { ok: true };
  });

  // ============ DATACENTER VLANS ============
  app.get('/api/datacenter-vlans', async () => {
    return prisma.datacenterVlan.findMany({ orderBy: [{ provider: 'asc' }, { vlanId: 'asc' }] });
  });

  app.post('/api/datacenter-vlans', async (req, reply) => {
    const { name, provider, vlanId, network, usage, broadcast } = req.body || {};
    if (!name || !String(name).trim()) {
      reply.code(400);
      return { error: 'name é obrigatório' };
    }
    const created = await prisma.datacenterVlan.create({
      data: {
        name: String(name).trim(),
        provider: provider ? String(provider).trim() : null,
        vlanId: vlanId != null && vlanId !== '' ? Number(vlanId) : null,
        network: network ? String(network).trim() : null,
        usage: usage ? String(usage).trim() : null,
        broadcast: broadcast ? String(broadcast).trim() : null,
      },
    });
    await auditFromReq(req, {
      entity: 'datacenter_vlan',
      entityId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  });

  app.patch('/api/datacenter-vlans/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.datacenterVlan.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'VLAN não encontrada' };
    }
    const data = pick(req.body, ['name', 'provider', 'network', 'usage', 'broadcast']);
    if ('vlanId' in (req.body || {})) {
      const v = req.body.vlanId;
      data.vlanId = v === '' || v == null ? null : Number(v);
    }
    const after = await prisma.datacenterVlan.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'datacenter_vlan',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.delete('/api/datacenter-vlans/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.datacenterVlan.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'VLAN não encontrada' };
    }
    await prisma.datacenterVlan.delete({ where: { id } });
    await auditFromReq(req, {
      entity: 'datacenter_vlan',
      entityId: id,
      action: 'delete',
      before,
    });
    return { ok: true };
  });

  // ============ AZURE SUBNETS ============
  app.get('/api/azure-subnets', async () => {
    return prisma.azureSubnet.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/api/azure-subnets', async (req, reply) => {
    const { name, network, usage, broadcast } = req.body || {};
    if (!name || !String(name).trim()) {
      reply.code(400);
      return { error: 'name é obrigatório' };
    }
    const created = await prisma.azureSubnet.create({
      data: {
        name: String(name).trim(),
        network: network ? String(network).trim() : null,
        usage: usage ? String(usage).trim() : null,
        broadcast: broadcast ? String(broadcast).trim() : null,
      },
    });
    await auditFromReq(req, {
      entity: 'azure_subnet',
      entityId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  });

  app.patch('/api/azure-subnets/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.azureSubnet.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'Azure subnet não encontrada' };
    }
    const data = pick(req.body, ['name', 'network', 'usage', 'broadcast']);
    const after = await prisma.azureSubnet.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'azure_subnet',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.delete('/api/azure-subnets/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.azureSubnet.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'Azure subnet não encontrada' };
    }
    await prisma.azureSubnet.delete({ where: { id } });
    await auditFromReq(req, {
      entity: 'azure_subnet',
      entityId: id,
      action: 'delete',
      before,
    });
    return { ok: true };
  });

  // ============ CIDR REFERENCE (read-only) ============
  app.get('/api/cidr-reference', async () => {
    return prisma.cidrReference.findMany({ orderBy: { id: 'asc' } });
  });
}
