import { prisma } from '../db.js';
import { requireAdmin } from '../auth.js';

export async function registerAuditRoutes(app) {
  app.get('/api/audit', { preHandler: requireAdmin }, async (req) => {
    const { entity, action, actor, take = '100', skip = '0' } = req.query || {};
    const where = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (actor) where.actor = { contains: actor, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(take) || 100, 500),
        skip: Number(skip) || 0,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  });

  app.get('/api/audit/entities', { preHandler: requireAdmin }, async () => {
    const [entities, actions] = await Promise.all([
      prisma.auditLog.findMany({
        distinct: ['entity'],
        select: { entity: true },
      }),
      prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
      }),
    ]);
    return {
      entities: entities.map((e) => e.entity).sort(),
      actions: actions.map((a) => a.action).sort(),
    };
  });
}
