import { prisma } from '../db.js';
import { audit, auditFromReq } from '../audit.js';
import { requireAdmin } from '../auth.js';

const STATUSES = new Set(['FREE', 'USED', 'RESERVED', 'CONFLICT']);
const BULK_ACTIONS = new Set(['release', 'reserve', 'update']);
const MAX_BULK = 500;

function inferStatus(input, current) {
  // If anything is filled in, default to USED unless explicitly set
  if (input.status && STATUSES.has(input.status)) return input.status;
  const filled = !!(input.hostname || input.type || input.function);
  if (filled) return 'USED';
  // If everything is being cleared, mark as FREE
  if (
    'hostname' in input &&
    'type' in input &&
    'function' in input &&
    !input.hostname &&
    !input.type &&
    !input.function
  ) {
    return 'FREE';
  }
  return current?.status || 'FREE';
}

export async function registerIps(app) {
  app.patch('/api/ips/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.ipAddress.findUnique({ where: { id } });
    if (!before) {
      const err = new Error('IP not found');
      err.statusCode = 404;
      throw err;
    }
    const body = req.body || {};
    const data = {};
    for (const k of ['type', 'hostname', 'function', 'notes']) {
      if (k in body) data[k] = body[k] === '' ? null : body[k];
    }
    data.status = inferStatus({ ...body, ...data }, before);
    const after = await prisma.ipAddress.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'ip',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.post('/api/ips/:id/release', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.ipAddress.findUnique({ where: { id } });
    if (!before) return null;
    const after = await prisma.ipAddress.update({
      where: { id },
      data: { type: null, hostname: null, function: null, notes: null, status: 'FREE' },
    });
    await auditFromReq(req, { entity: 'ip', entityId: id, action: 'release', before, after });
    return after;
  });

  app.post('/api/ips/:id/reserve', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.ipAddress.findUnique({ where: { id } });
    if (!before) return null;
    const after = await prisma.ipAddress.update({
      where: { id },
      data: { status: 'RESERVED' },
    });
    await auditFromReq(req, { entity: 'ip', entityId: id, action: 'reserve', before, after });
    return after;
  });

  // Allocate an IP to a Device (existing or new). Body shape:
  //   {
  //     device: { id: 42 }                                    // use existing
  //     device: { name, type?, vendor?, model?, serial?, osInfo?, role?, ownerEmail?, notes? }  // create new
  //     hostname?, function?, notes?, macAddress?
  //   }
  // The Device's fields snapshot into the IpAddress (type/vendor/model/osInfo)
  // so the legacy columns stay consistent with the canonical Device record.
  app.post('/api/ips/:id/allocate', async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.ipAddress.findUnique({
      where: { id },
      include: { subnet: { select: { siteId: true } } },
    });
    if (!before) {
      reply.code(404);
      return { error: 'IP not found' };
    }
    const body = req.body || {};
    const dev = body.device || {};
    const inferredSiteId = before.subnet?.siteId ?? null;

    let device;
    if (dev.id) {
      device = await prisma.device.findUnique({ where: { id: Number(dev.id) } });
      if (!device) {
        reply.code(400);
        return { error: 'device informado não existe' };
      }
    } else if (dev.name && String(dev.name).trim()) {
      device = await prisma.device.create({
        data: {
          name: String(dev.name).trim(),
          type: dev.type || null,
          vendor: dev.vendor || null,
          model: dev.model || null,
          serial: dev.serial || null,
          osInfo: dev.osInfo || null,
          role: dev.role || null,
          siteId: dev.siteId != null ? Number(dev.siteId) : inferredSiteId,
          ownerEmail: dev.ownerEmail || null,
          notes: dev.notes || null,
        },
      });
    } else {
      reply.code(400);
      return { error: 'informe device.id (existente) ou device.name (novo)' };
    }

    const data = {
      status: 'USED',
      deviceId: device.id,
      hostname: body.hostname != null ? String(body.hostname).trim() || null : device.name,
      function: body.function != null ? String(body.function).trim() || null : device.role,
      notes: body.notes != null ? String(body.notes).trim() || null : before.notes,
      macAddress: body.macAddress != null ? String(body.macAddress).trim() || null : before.macAddress,
      // Snapshot dos campos canônicos do Device pro IP (compat com UI atual)
      type: device.type,
      vendor: device.vendor,
      model: device.model,
      osInfo: device.osInfo,
    };

    const after = await prisma.ipAddress.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'ip',
      entityId: id,
      action: 'allocate',
      before,
      after,
    });
    return { ip: after, device };
  });

  // Bulk action sobre uma lista de IPs. Admin-gated.
  // body: { ipIds: number[], action: 'release' | 'reserve' | 'update', data?: {function, notes, type} }
  // Resposta: { action, requested, updated, failed: [{id, reason}] }
  app.post('/api/ips/bulk', { preHandler: requireAdmin }, async (req, reply) => {
    const body = req.body || {};
    const ipIds = Array.isArray(body.ipIds) ? body.ipIds.map(Number).filter((n) => Number.isInteger(n)) : [];
    const action = body.action;
    if (!ipIds.length) {
      reply.code(400);
      return { error: 'ipIds vazio ou inválido' };
    }
    if (ipIds.length > MAX_BULK) {
      reply.code(400);
      return { error: `máximo ${MAX_BULK} IPs por chamada` };
    }
    if (!BULK_ACTIONS.has(action)) {
      reply.code(400);
      return { error: `action inválido: ${action}`, valid: Array.from(BULK_ACTIONS) };
    }

    const updated = [];
    const failed = [];
    for (const id of ipIds) {
      try {
        const before = await prisma.ipAddress.findUnique({ where: { id } });
        if (!before) {
          failed.push({ id, reason: 'not_found' });
          continue;
        }
        let data;
        let actionTag = action;
        if (action === 'release') {
          data = { type: null, hostname: null, function: null, notes: null, status: 'FREE', deviceId: null };
        } else if (action === 'reserve') {
          data = { status: 'RESERVED' };
        } else {
          // update — só campos seguros
          const patch = {};
          const src = body.data || {};
          for (const k of ['type', 'function', 'notes']) {
            if (k in src) patch[k] = src[k] === '' ? null : src[k];
          }
          if (Object.keys(patch).length === 0) {
            failed.push({ id, reason: 'no_fields_to_update' });
            continue;
          }
          // Status: se algum campo foi preenchido e o IP era FREE, vira USED
          if ((patch.hostname || patch.type || patch.function) && before.status === 'FREE') {
            patch.status = 'USED';
          }
          data = patch;
        }
        const after = await prisma.ipAddress.update({ where: { id }, data });
        await auditFromReq(req, {
          entity: 'ip',
          entityId: id,
          action: `bulk_${actionTag}`,
          before,
          after,
        });
        updated.push(id);
      } catch (err) {
        failed.push({ id, reason: err.message });
      }
    }
    return {
      action,
      requested: ipIds.length,
      updated: updated.length,
      failed,
    };
  });
}
