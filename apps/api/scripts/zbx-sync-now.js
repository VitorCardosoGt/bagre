// Dispara um sync Zabbix manualmente. Útil pra testar config nova.
// Roda dentro do container api: node /app/scripts/zbx-sync-now.js
import { prisma } from '../src/db.js';
import { getConfig, testConnection, syncFromZabbix } from '../src/integrations/zabbix.js';

async function main() {
  const cfg = await getConfig();
  console.log('config:', { url: cfg.url, enabled: cfg.enabled, intervalMinutes: cfg.intervalMinutes, hasToken: !!cfg.apiToken });

  console.log('\n--- testConnection ---');
  const t = await testConnection(cfg);
  console.log(JSON.stringify(t));
  if (!t.ok) {
    console.error('testConnection failed, abortando sync');
    process.exit(1);
  }

  console.log('\n--- syncFromZabbix ---');
  const r = await syncFromZabbix(cfg);
  console.log(JSON.stringify({
    ok: r.ok,
    durationMs: r.durationMs,
    hosts: r.hosts,
    received: r.received,
    updated: r.updated,
    ghosts_count: r.ghosts ? r.ghosts.length : 0,
    ghosts_sample: r.ghosts ? r.ghosts.slice(0, 10) : [],
    errors_count: r.errors ? r.errors.length : 0,
    errors_sample: r.errors ? r.errors.slice(0, 5) : [],
  }, null, 2));
}

main()
  .catch((e) => { console.error('ERROR:', e.message, e.stack); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
