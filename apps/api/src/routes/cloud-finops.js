// Cloud FinOps — relatórios derivados dos dados sincronizados pelo cloud sync.
//
// Foco inicial: identificar Public IPs ociosos (alocados mas sem uso),
// estimando o custo desperdiçado por mês. Esse é o "killer feature" da fase
// 2.5 do roadmap — ROI mensurável pra times com presença em cloud.
//
// Endpoints:
//   GET /api/cloud/finops/idle-public-ips   relatório agregado + lista
//
// Custo unitário (por enquanto constante; futuro: tabela por provider/region):
//   AWS Elastic IP                : US$ 0.005/hora
//   Azure Public IP Standard      : US$ 0.005/hora (estática)
//   GCP External IP unused        : US$ 0.010/hora (out_of_use, política nova)
//
// Documentado em https://aws.amazon.com/vpc/pricing/ etc. Os valores são
// estimativas — operadores devem confirmar com seu billing real.

import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';

const HOURLY_RATE_USD = {
  AWS: 0.005,
  AZURE: 0.005,
  GCP: 0.010,
};
const HOURS_PER_MONTH = 730; // média (365.25 * 24 / 12)

/** Estima custo mensal de um IP público ocioso em USD. */
function estimateMonthlyCost(provider) {
  const rate = HOURLY_RATE_USD[provider] ?? 0.005;
  return rate * HOURS_PER_MONTH;
}

/** Heurística: o IP é PUBLIC e o cloudMetadata indica não associado. */
function isIdlePublicIp(ip) {
  if (ip.ipKind !== 'PUBLIC') return false;
  const meta = ip.cloudMetadata || {};
  // AWS Elastic IPs trazem `associated: false` quando órfãos.
  if (meta.associated === false) return true;
  // Azure / GCP: futuro — adicionar flags equivalentes quando providers
  // forem implementados (azure: ipConfiguration === null, gcp: status !== IN_USE)
  return false;
}

export async function registerCloudFinOpsRoutes(app) {
  // --- Idle public IPs ---
  app.get('/api/cloud/finops/idle-public-ips', { preHandler: requireAuth }, async () => {
    // Carrega todos os IPs públicos vindos de cloud sync (filtra na app por
    // simplicidade — em escala alta migrar pra query JSON do Postgres).
    const ips = await prisma.ipAddress.findMany({
      where: {
        ipKind: 'PUBLIC',
        source: { startsWith: 'cloud:' },
      },
      include: {
        cloudAccount: true,
        subnet: { include: { site: true } },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    const idle = ips.filter(isIdlePublicIp);

    // Aggregations
    const byAccount = new Map();
    let totalMonthlyCost = 0;
    for (const ip of idle) {
      const provider = ip.cloudAccount?.provider || 'AWS';
      const cost = estimateMonthlyCost(provider);
      totalMonthlyCost += cost;
      const key = ip.cloudAccountId ?? 0;
      const cur = byAccount.get(key) || {
        accountId: ip.cloudAccountId,
        accountName: ip.cloudAccount?.displayName ?? '(unknown)',
        provider,
        idleCount: 0,
        estimatedMonthlyCostUsd: 0,
      };
      cur.idleCount += 1;
      cur.estimatedMonthlyCostUsd += cost;
      byAccount.set(key, cur);
    }

    const items = idle.map((ip) => ({
      ipId: ip.id,
      address: ip.address,
      hostname: ip.hostname,
      accountId: ip.cloudAccountId,
      accountName: ip.cloudAccount?.displayName,
      provider: ip.cloudAccount?.provider,
      siteName: ip.subnet?.site?.name,
      subnetName: ip.subnet?.name,
      tags: ip.cloudMetadata?.tags || {},
      allocationId: ip.cloudMetadata?.allocationId,
      lastSeenAt: ip.lastSeenAt,
      estimatedMonthlyCostUsd: Number(estimateMonthlyCost(ip.cloudAccount?.provider || 'AWS').toFixed(2)),
    }));

    return {
      summary: {
        idleCount: idle.length,
        totalPublicIps: ips.length,
        estimatedMonthlyCostUsd: Number(totalMonthlyCost.toFixed(2)),
        rateAssumptionsUsdPerHour: HOURLY_RATE_USD,
        hoursPerMonth: HOURS_PER_MONTH,
      },
      byAccount: Array.from(byAccount.values()).map((a) => ({
        ...a,
        estimatedMonthlyCostUsd: Number(a.estimatedMonthlyCostUsd.toFixed(2)),
      })),
      items,
    };
  });
}
