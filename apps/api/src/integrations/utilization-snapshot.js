// Captura snapshots periódicos da utilização de cada subnet — alimenta o
// gráfico de histórico temporal exibido na página de detalhes da subnet.
//
// Estratégia:
//   - Roda a cada SNAPSHOT_INTERVAL_MINUTES (default 60).
//   - Para cada subnet, conta IPs por status num único query agregado.
//   - Cria uma linha em SubnetUtilizationSnapshot.
//   - Skipa subnets que já tiveram snapshot há menos do que o intervalo
//     (evita acumulação se o scheduler for chamado fora de hora).
//
// Considerações de escala:
//   - Para 50 subnets x 24h/dia x 30 dias = 36.000 linhas/mês. Negligível.
//   - Para 10k subnets: ~7.2M linhas/mês. Aí precisa de retention policy
//     (delete snapshots > N dias). Por ora não implementamos retention.

import { prisma } from '../db.js';

const INTERVAL_MIN = Math.max(5, Number(process.env.SNAPSHOT_INTERVAL_MINUTES) || 60);

/** Captura snapshot de uma subnet específica. Idempotente dentro do intervalo. */
export async function snapshotSubnet(subnetId) {
  const cutoff = new Date(Date.now() - (INTERVAL_MIN - 1) * 60_000);
  const recent = await prisma.subnetUtilizationSnapshot.findFirst({
    where: { subnetId, takenAt: { gte: cutoff } },
    select: { id: true },
  });
  if (recent) return { skipped: true, reason: 'too_recent' };

  // Conta agregada por status num único query
  const grouped = await prisma.ipAddress.groupBy({
    by: ['status'],
    where: { subnetId },
    _count: { _all: true },
  });
  const counts = { USED: 0, RESERVED: 0, FREE: 0, CONFLICT: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  const ipCount = counts.USED + counts.RESERVED + counts.FREE + counts.CONFLICT;

  if (ipCount === 0) return { skipped: true, reason: 'no_ips' };

  const snap = await prisma.subnetUtilizationSnapshot.create({
    data: {
      subnetId,
      ipCount,
      usedCount: counts.USED,
      reservedCount: counts.RESERVED,
      freeCount: counts.FREE + counts.CONFLICT, // conflict treated as effectively non-free
    },
  });
  return { created: snap.id, counts };
}

/** Captura snapshot de TODAS as subnets que têm pelo menos 1 IP. */
export async function snapshotAll(log) {
  const subnets = await prisma.subnet.findMany({ select: { id: true } });
  let created = 0;
  let skipped = 0;
  for (const s of subnets) {
    try {
      const r = await snapshotSubnet(s.id);
      if (r.created) created++;
      else skipped++;
    } catch (err) {
      log?.warn?.({ subnetId: s.id, err: err.message }, 'snapshot failed');
    }
  }
  return { totalSubnets: subnets.length, created, skipped };
}

// ---- Scheduler ----
let timer = null;

export async function startScheduler(log) {
  if (timer) clearInterval(timer);
  // Primeira execução 2 min depois do boot pra não brigar com outros schedulers
  setTimeout(async () => {
    try {
      const r = await snapshotAll(log);
      log?.info?.({ result: r }, 'utilization snapshot batch done');
    } catch (err) {
      log?.warn?.({ err: err.message }, 'utilization snapshot batch failed');
    }
  }, 120_000);
  timer = setInterval(async () => {
    try {
      const r = await snapshotAll(log);
      log?.info?.({ result: r }, 'utilization snapshot batch done');
    } catch (err) {
      log?.warn?.({ err: err.message }, 'utilization snapshot batch failed');
    }
  }, INTERVAL_MIN * 60_000);
  log?.info?.(`utilization snapshot scheduler running every ${INTERVAL_MIN}min`);
}
