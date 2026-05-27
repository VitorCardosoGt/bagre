// Routes for managing CloudAccount + trigger sync.
//
// Endpoints:
//   GET    /api/cloud-accounts            list (no creds returned)
//   POST   /api/cloud-accounts            create new account (admin only)
//   GET    /api/cloud-accounts/:id        get one (no creds)
//   PATCH  /api/cloud-accounts/:id        update fields (no creds rotation here)
//   DELETE /api/cloud-accounts/:id        delete account + cascade syncs
//   POST   /api/cloud-accounts/:id/test   validate creds without sync (admin only)
//   POST   /api/cloud-accounts/:id/sync   trigger manual sync (admin only)
//   GET    /api/cloud-accounts/:id/runs   list sync history (paginated)
//   GET    /api/cloud-providers           list supported providers

import { prisma } from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { auditFromReq } from '../audit.js';
import { encryptCredentials, decryptCredentials } from '../integrations/cloud/crypto.js';
import { getProvider, listImplementedProviders } from '../integrations/cloud/index.js';
import { runSync } from '../integrations/cloud/sync.js';

const SUPPORTED_PROVIDERS = ['AWS', 'AZURE', 'GCP'];

function safeView(account) {
  if (!account) return null;
  const { credentialsEnc, ...rest } = account;
  return { ...rest, hasCredentials: !!credentialsEnc };
}

export async function registerCloudAccountRoutes(app) {
  // --- LIST providers (which ones are actually implemented) ---
  app.get('/api/cloud-providers', { preHandler: requireAuth }, async () => {
    return {
      supported: SUPPORTED_PROVIDERS,
      implemented: listImplementedProviders(),
    };
  });

  // --- LIST cloud accounts ---
  app.get('/api/cloud-accounts', { preHandler: requireAuth }, async () => {
    const accounts = await prisma.cloudAccount.findMany({
      orderBy: [{ provider: 'asc' }, { displayName: 'asc' }],
    });
    return accounts.map(safeView);
  });

  // --- GET one ---
  app.get('/api/cloud-accounts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number(req.params.id);
    const account = await prisma.cloudAccount.findUnique({ where: { id } });
    if (!account) return reply.code(404).send({ error: 'not_found' });
    return safeView(account);
  });

  // --- CREATE ---
  app.post('/api/cloud-accounts', { preHandler: requireAdmin }, async (req, reply) => {
    const body = req.body || {};
    const { provider, displayName, scope, regions, credentials, syncMode, pollIntervalMin, tags } = body;

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return reply.code(400).send({ error: 'invalid_provider', supported: SUPPORTED_PROVIDERS });
    }
    if (!listImplementedProviders().includes(provider)) {
      return reply.code(400).send({
        error: 'provider_not_implemented_yet',
        implemented: listImplementedProviders(),
      });
    }
    if (!displayName || !scope || !credentials) {
      return reply.code(400).send({ error: 'missing_fields', required: ['displayName', 'scope', 'credentials'] });
    }

    // Validar credenciais ANTES de salvar — fail fast
    const credsStr = typeof credentials === 'string' ? credentials : JSON.stringify(credentials);
    try {
      await getProvider(provider).validateCredentials(credsStr);
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_credentials', detail: err.message });
    }

    let credentialsEnc;
    try {
      credentialsEnc = encryptCredentials(credsStr);
    } catch (err) {
      return reply.code(500).send({ error: 'encryption_failed', detail: err.message });
    }

    const account = await prisma.cloudAccount.create({
      data: {
        provider,
        displayName,
        scope,
        regions: regions || [],
        credentialsEnc,
        syncMode: syncMode || 'READ_ONLY',
        pollIntervalMin: pollIntervalMin || 15,
        tags: tags || [],
      },
    });

    await auditFromReq(req, 'create', 'cloud_account', account.id, { provider, displayName, scope });
    return reply.code(201).send(safeView(account));
  });

  // --- UPDATE (no creds rotation here; use POST /rotate-creds future) ---
  app.patch('/api/cloud-accounts/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const existing = await prisma.cloudAccount.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });

    const body = req.body || {};
    const allowed = ['displayName', 'regions', 'syncMode', 'pollIntervalMin', 'status', 'tags'];
    const data = {};
    for (const k of allowed) {
      if (k in body) data[k] = body[k];
    }
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'no_updatable_fields', allowed });
    }

    const updated = await prisma.cloudAccount.update({ where: { id }, data });
    await auditFromReq(req, 'update', 'cloud_account', id, data);
    return safeView(updated);
  });

  // --- DELETE ---
  app.delete('/api/cloud-accounts/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const existing = await prisma.cloudAccount.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await prisma.cloudAccount.delete({ where: { id } });
    await auditFromReq(req, 'delete', 'cloud_account', id, {});
    return reply.code(204).send();
  });

  // --- TEST credentials ---
  app.post('/api/cloud-accounts/:id/test', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const account = await prisma.cloudAccount.findUnique({ where: { id } });
    if (!account) return reply.code(404).send({ error: 'not_found' });

    try {
      const credsStr = decryptCredentials(account.credentialsEnc);
      const provider = getProvider(account.provider);
      const result = await provider.validateCredentials(credsStr);
      return { ok: true, detail: result };
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err.message });
    }
  });

  // --- TRIGGER sync manually ---
  app.post('/api/cloud-accounts/:id/sync', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number(req.params.id);
    const account = await prisma.cloudAccount.findUnique({ where: { id } });
    if (!account) return reply.code(404).send({ error: 'not_found' });

    try {
      const { runId, summary } = await runSync(prisma, id);
      await auditFromReq(req, 'sync', 'cloud_account', id, { runId, ...summary });
      return { ok: true, runId, summary };
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // --- LIST sync runs (history) ---
  app.get('/api/cloud-accounts/:id/runs', { preHandler: requireAuth }, async (req) => {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const runs = await prisma.cloudSyncRun.findMany({
      where: { cloudAccountId: id },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return runs;
  });
}
