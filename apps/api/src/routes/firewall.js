import { prisma } from '../db.js';
import { auditFromReq } from '../audit.js';

export async function registerFirewall(app) {
  app.get('/api/firewall-rules', async () => {
    return prisma.firewallRule.findMany({ orderBy: { id: 'asc' } });
  });

  app.post('/api/firewall-rules', async (req) => {
    const created = await prisma.firewallRule.create({ data: req.body || {} });
    await auditFromReq(req, {
      entity: 'firewall_rule',
      entityId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  });

  app.patch('/api/firewall-rules/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.firewallRule.findUnique({ where: { id } });
    const after = await prisma.firewallRule.update({ where: { id }, data: req.body || {} });
    await auditFromReq(req, {
      entity: 'firewall_rule',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.delete('/api/firewall-rules/:id', async (req) => {
    const id = Number(req.params.id);
    const before = await prisma.firewallRule.findUnique({ where: { id } });
    await prisma.firewallRule.delete({ where: { id } });
    await auditFromReq(req, {
      entity: 'firewall_rule',
      entityId: id,
      action: 'delete',
      before,
    });
    return { ok: true };
  });
}
