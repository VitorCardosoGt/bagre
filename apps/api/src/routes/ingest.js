// Bulk ingestion endpoint for monitoring/discovery tools.
//
// Auth: header `X-Ingest-Token` matching env INGEST_TOKEN. If INGEST_TOKEN is
// unset, ingestion is disabled.
//
// Body: { discoveries: [ { address, hostname?, type?, function?, status?, source? }, ... ] }
//
// Behavior:
// - For each discovery, find the IpAddress row by `address` across all subnets.
// - If exactly one match, update it (only fields that were provided).
// - If multiple matches (same address in different subnets), update all by default,
//   or restrict by an optional { siteCode } / { subnetCidr } filter on the row.
// - If no match, the address is reported as "unmatched" (we don't auto-create
//   ad-hoc subnets — discoveries should come from the documented address space).

import { prisma } from '../db.js';
import { audit } from '../audit.js';

const STATUSES = new Set(['FREE', 'USED', 'RESERVED', 'CONFLICT']);

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (k in o && o[k] !== undefined) out[k] = o[k];
  return out;
}

export async function registerIngest(app) {
  app.post('/api/ingest/discoveries', async (req, reply) => {
    const expected = process.env.INGEST_TOKEN;
    if (!expected) {
      reply.code(503);
      return { error: 'ingest disabled — set INGEST_TOKEN env var' };
    }
    const got = req.headers['x-ingest-token'];
    if (got !== expected) {
      reply.code(403);
      return { error: 'invalid ingest token' };
    }

    const items = (req.body && req.body.discoveries) || [];
    if (!Array.isArray(items)) {
      reply.code(400);
      return { error: 'discoveries must be an array' };
    }

    const result = {
      received: items.length,
      updated: 0,
      unmatched: [],
      errors: [],
    };

    for (const it of items) {
      try {
        if (!it.address) {
          result.errors.push({ item: it, reason: 'missing address' });
          continue;
        }
        const where = { address: it.address };
        if (it.subnetCidr) {
          where.subnet = { cidr: it.subnetCidr };
        } else if (it.siteCode) {
          where.subnet = { site: { code: it.siteCode } };
        }
        const matches = await prisma.ipAddress.findMany({ where });
        if (matches.length === 0) {
          result.unmatched.push(it.address);
          continue;
        }
        const data = pick(it, ['hostname', 'type', 'function', 'notes']);
        if (it.status && STATUSES.has(it.status)) {
          data.status = it.status;
        } else if (it.hostname || it.type || it.function) {
          data.status = 'USED';
        }
        // Track liveness — every successful ingest stamps lastSeen.
        data.lastSeenAt = new Date();
        data.lastSeenSource = it.source || 'ingest';
        if (it.externalRef) data.externalRef = it.externalRef;
        for (const m of matches) {
          const after = await prisma.ipAddress.update({ where: { id: m.id }, data });
          await audit({
            entity: 'ip',
            entityId: m.id,
            action: 'ingest',
            before: m,
            after,
            actor: it.source || 'ingest',
          });
        }
        result.updated += matches.length;
      } catch (err) {
        result.errors.push({ item: it, reason: err.message });
      }
    }
    return result;
  });

  // Convenience: announce a host going down -> mark notes / keep status
  app.post('/api/ingest/heartbeat', async (req, reply) => {
    const expected = process.env.INGEST_TOKEN;
    if (!expected) {
      reply.code(503);
      return { error: 'ingest disabled' };
    }
    if (req.headers['x-ingest-token'] !== expected) {
      reply.code(403);
      return { error: 'invalid ingest token' };
    }
    const { address, alive, source } = req.body || {};
    if (!address) {
      reply.code(400);
      return { error: 'missing address' };
    }
    const matches = await prisma.ipAddress.findMany({ where: { address } });
    for (const m of matches) {
      await prisma.ipAddress.update({
        where: { id: m.id },
        data: {
          notes: alive
            ? `last seen ${new Date().toISOString()} via ${source || 'monitor'}`
            : `unreachable since ${new Date().toISOString()} via ${source || 'monitor'}`,
        },
      });
    }
    return { matched: matches.length };
  });
}
