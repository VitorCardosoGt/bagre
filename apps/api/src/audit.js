import { prisma } from './db.js';

function actorOf(req) {
  if (!req) return null;
  if (req.user?.email) return req.user.email;
  if (req.headers?.['x-actor']) return String(req.headers['x-actor']);
  return null;
}

export async function audit({ entity, entityId, action, before, after, actor, ip }) {
  try {
    await prisma.auditLog.create({
      data: {
        entity,
        entityId: Number(entityId) || 0,
        action,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
        actor: actor || null,
        ip: ip || null,
      },
    });
  } catch (err) {
    console.warn('audit log failed', err.message);
  }
}

/** Convenience wrapper that pulls actor from the request automatically. */
export async function auditFromReq(req, { entity, entityId, action, before, after }) {
  return audit({
    entity,
    entityId,
    action,
    before,
    after,
    actor: actorOf(req),
    ip: req?.ip || null,
  });
}
