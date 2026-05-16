import { prisma } from '../db.js';
import { auditFromReq } from '../audit.js';

const ALLOWED_FIELDS = [
  'name', 'type', 'vendor', 'model', 'serial',
  'osInfo', 'role', 'siteId', 'ownerEmail', 'notes',
  'lastSeenAt', 'externalRef',
];

function pickDeviceFields(body) {
  const data = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) data[k] = body[k] === '' ? null : body[k];
  }
  if ('siteId' in data && data.siteId !== null) data.siteId = Number(data.siteId);
  return data;
}

export async function registerDevices(app) {
  app.get('/api/devices', async (req) => {
    const { q, siteId, type, vendor } = req.query || {};
    const where = {};
    if (siteId) where.siteId = Number(siteId);
    if (type) where.type = { equals: type, mode: 'insensitive' };
    if (vendor) where.vendor = { contains: vendor, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { serial: { contains: q, mode: 'insensitive' } },
        { ownerEmail: { contains: q, mode: 'insensitive' } },
      ];
    }
    return prisma.device.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        site: { select: { id: true, code: true, name: true } },
        _count: { select: { ips: true } },
      },
    });
  });

  app.get('/api/devices/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, code: true, name: true } },
        ips: {
          select: {
            id: true, address: true, status: true,
            subnetId: true,
            subnet: { select: { id: true, name: true, cidr: true, siteId: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!device) {
      reply.code(404);
      return { error: 'device not found' };
    }
    return device;
  });

  app.post('/api/devices', async (req, reply) => {
    const body = req.body || {};
    if (!body.name || !String(body.name).trim()) {
      reply.code(400);
      return { error: 'name é obrigatório' };
    }
    const data = pickDeviceFields(body);
    data.name = String(data.name).trim();
    const created = await prisma.device.create({ data });
    await auditFromReq(req, {
      entity: 'device',
      entityId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  });

  app.patch('/api/devices/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.device.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'device not found' };
    }
    const data = pickDeviceFields(req.body || {});
    if ('name' in data && data.name) data.name = String(data.name).trim();
    const after = await prisma.device.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'device',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.delete('/api/devices/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.device.findUnique({
      where: { id },
      include: { _count: { select: { ips: true } } },
    });
    if (!before) {
      reply.code(404);
      return { error: 'device not found' };
    }
    // IPs vinculados ficam com deviceId=null automaticamente (onDelete: SetNull)
    await prisma.device.delete({ where: { id } });
    await auditFromReq(req, {
      entity: 'device',
      entityId: id,
      action: 'delete',
      before,
    });
    return { ok: true, ipsDetached: before._count.ips };
  });
}
