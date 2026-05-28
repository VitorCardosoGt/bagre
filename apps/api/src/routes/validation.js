// CRUD admin para ValidationRule + endpoint de teste contra um subnet candidate.

import { prisma } from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { auditFromReq } from '../audit.js';
import { validateSubnet, SUPPORTED_RULE_TYPES } from '../validation/engine.js';

export async function registerValidationRoutes(app) {
  app.get('/api/validation/rule-types', { preHandler: requireAuth }, async () => {
    return { supported: SUPPORTED_RULE_TYPES };
  });

  app.get('/api/validation/rules', { preHandler: requireAuth }, async () => {
    return prisma.validationRule.findMany({ orderBy: { id: 'asc' } });
  });

  app.post('/api/validation/rules', { preHandler: requireAdmin }, async (req, reply) => {
    const body = req.body || {};
    if (!body.name || !body.ruleType) {
      reply.code(400);
      return { error: 'name e ruleType são obrigatórios' };
    }
    if (!SUPPORTED_RULE_TYPES.includes(body.ruleType)) {
      reply.code(400);
      return { error: `ruleType inválido: ${body.ruleType}`, valid: SUPPORTED_RULE_TYPES };
    }
    const created = await prisma.validationRule.create({
      data: {
        name: String(body.name).trim(),
        ruleType: body.ruleType,
        enabled: body.enabled !== false,
        scope: body.scope || null,
        config: body.config || {},
        severity: body.severity === 'warning' ? 'warning' : 'error',
      },
    });
    await auditFromReq(req, {
      entity: 'validation_rule',
      entityId: created.id,
      action: 'create',
      after: created,
    });
    return created;
  });

  app.patch('/api/validation/rules/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.validationRule.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'rule não encontrada' };
    }
    const body = req.body || {};
    const data = {};
    for (const k of ['enabled', 'scope', 'config', 'severity', 'name']) {
      if (k in body) data[k] = body[k];
    }
    const after = await prisma.validationRule.update({ where: { id }, data });
    await auditFromReq(req, {
      entity: 'validation_rule',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  });

  app.delete('/api/validation/rules/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const before = await prisma.validationRule.findUnique({ where: { id } });
    if (!before) {
      reply.code(404);
      return { error: 'rule não encontrada' };
    }
    await prisma.validationRule.delete({ where: { id } });
    await auditFromReq(req, {
      entity: 'validation_rule',
      entityId: id,
      action: 'delete',
      before,
    });
    return { ok: true };
  });

  // Test um subnet candidate contra todas as regras enabled — útil pra UI
  // mostrar "preview" antes de o usuário salvar.
  app.post('/api/validation/test-subnet', { preHandler: requireAuth }, async (req) => {
    const result = await validateSubnet(prisma, req.body || {});
    return result;
  });
}
