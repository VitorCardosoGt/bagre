// Prometheus metrics endpoint. Mount at /metrics (no /api prefix - by convention).
//
// Exposes:
//   - default Node.js process metrics
//   - bagre_ip_count{status,site,subnet}
//   - bagre_subnet_total
//   - bagre_site_total

import client from 'prom-client';
import { prisma } from '../db.js';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'bagre_' });

const ipGauge = new client.Gauge({
  name: 'bagre_ip_count',
  help: 'IP addresses grouped by status, site and subnet',
  labelNames: ['status', 'site', 'subnet'],
  registers: [registry],
});

const subnetGauge = new client.Gauge({
  name: 'bagre_subnet_total',
  help: 'Number of subnets',
  registers: [registry],
});

const siteGauge = new client.Gauge({
  name: 'bagre_site_total',
  help: 'Number of sites',
  registers: [registry],
});

const utilizationGauge = new client.Gauge({
  name: 'bagre_subnet_utilization_ratio',
  help: 'Used IPs / total IPs per subnet (0..1)',
  labelNames: ['site', 'subnet'],
  registers: [registry],
});

async function collectGauges() {
  ipGauge.reset();
  utilizationGauge.reset();

  const [siteCount, subnetCount] = await Promise.all([
    prisma.site.count(),
    prisma.subnet.count(),
  ]);
  siteGauge.set(siteCount);
  subnetGauge.set(subnetCount);

  const subnets = await prisma.subnet.findMany({
    include: { site: true, ips: { select: { status: true } } },
  });

  for (const sub of subnets) {
    const counts = { FREE: 0, USED: 0, RESERVED: 0, CONFLICT: 0 };
    for (const ip of sub.ips) counts[ip.status] = (counts[ip.status] || 0) + 1;
    for (const [status, n] of Object.entries(counts)) {
      ipGauge.set({ status, site: sub.site.code, subnet: sub.name }, n);
    }
    const total = sub.ips.length;
    const used = counts.USED + counts.RESERVED;
    utilizationGauge.set(
      { site: sub.site.code, subnet: sub.name },
      total > 0 ? used / total : 0,
    );
  }
}

export async function registerMetrics(app) {
  app.get('/metrics', async (_req, reply) => {
    try {
      await collectGauges();
      reply.header('Content-Type', registry.contentType);
      return registry.metrics();
    } catch (err) {
      reply.code(500);
      return `# error collecting metrics: ${err.message}\n`;
    }
  });
}
