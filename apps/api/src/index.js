import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

import { prisma } from './db.js';
import { ensureBootstrapAdmin, requireAuth, requireAdmin } from './auth.js';
import { registerSites } from './routes/sites.js';
import { registerSubnets } from './routes/subnets.js';
import { registerIps } from './routes/ips.js';
import { registerSearch } from './routes/search.js';
import { registerCatalogs } from './routes/catalogs.js';
import { registerImport } from './routes/import.js';
import { registerStats } from './routes/stats.js';
import { registerIngest } from './routes/ingest.js';
import { registerMetrics } from './routes/metrics.js';
import { registerAuth } from './routes/auth.js';
import { registerUsers } from './routes/users.js';
import { registerDevices } from './routes/devices.js';
import { registerPendingDiscoveries } from './routes/pending-discoveries.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerOidcRoutes } from './routes/oidc.js';
import { registerZabbixRoutes } from './routes/zabbix.js';
import { registerNetworkHealthRoutes } from './routes/network-health.js';
import { registerIntegrationsStatusRoutes } from './routes/integrations-status.js';
import { registerCloudAccountRoutes } from './routes/cloud-accounts.js';
import { registerCloudFinOpsRoutes } from './routes/cloud-finops.js';
import { startScheduler as startZabbixScheduler } from './integrations/zabbix.js';

const PORT = Number(process.env.PORT || 3001);

async function build() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-please-change',
  });

  app.decorate('requireAuth', requireAuth);
  app.decorate('requireAdmin', requireAdmin);

  await ensureBootstrapAdmin(app.log);

  // Public paths (no auth required). /api/import/seed and /api/ingest/* are
  // handled by their own token-based auth so that automated tooling can call
  // them without a user JWT.
  const PUBLIC = new Set([
    '/api/health',
    '/api/config',
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/reset-request',
    '/api/auth/reset',
    '/api/auth/sso/start',
    '/api/auth/sso/callback',
    '/api/import/seed',
    '/api/ingest/discoveries',
    '/api/ingest/heartbeat',
    '/metrics',
  ]);
  // Lab/dev only: deixa /api/stats público quando STATS_PUBLIC=true. Padrão off.
  if (process.env.STATS_PUBLIC === 'true') PUBLIC.add('/api/stats');

  // Global guard — applies on every request before handlers run
  app.addHook('onRequest', async (req, reply) => {
    const url = req.routeOptions?.url || req.url.split('?')[0];
    // Only protect /api/* paths
    if (!url.startsWith('/api/')) return;
    if (PUBLIC.has(url)) return;
    // Auth
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    const id = Number(req.user?.sub);
    if (!id) {
      reply.code(401).send({ error: 'invalid token' });
      return reply;
    }
    const dbUser = await prisma.user.findUnique({ where: { id } });
    if (!dbUser || !dbUser.active) {
      reply.code(401).send({ error: 'user inactive' });
      return reply;
    }
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      name: dbUser.name,
      mustChangePwd: dbUser.mustChangePwd,
    };
    // Write methods require ADMIN — except change-password & user-self routes
    const adminOnlyForWrites = !(
      url === '/api/auth/change-password' || url === '/api/auth/me'
    );
    if (
      adminOnlyForWrites &&
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
      dbUser.role !== 'ADMIN'
    ) {
      reply.code(403).send({ error: 'forbidden — requer perfil ADMIN' });
      return reply;
    }
  });

  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  await registerAuth(app);
  await registerUsers(app);
  await registerDevices(app);
  await registerPendingDiscoveries(app);
  await registerAuditRoutes(app);
  await registerOidcRoutes(app);
  await registerZabbixRoutes(app);
  await registerNetworkHealthRoutes(app);
  await registerIntegrationsStatusRoutes(app);
  await registerCloudAccountRoutes(app);
  await registerCloudFinOpsRoutes(app);
  // Background scheduler (non-blocking)
  startZabbixScheduler(app.log).catch((e) => app.log.warn(e, 'zabbix scheduler init failed'));

  await registerStats(app);
  await registerSites(app);
  await registerSubnets(app);
  await registerIps(app);
  await registerSearch(app);
  await registerCatalogs(app);
  await registerImport(app);
  await registerIngest(app);
  await registerMetrics(app);

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    reply.code(err.statusCode || 500).send({ error: err.message });
  });

  return app;
}

build()
  .then(async (app) => {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`API listening on :${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
