// Sync engine — orquestra a leitura do provider e persiste no Bagre.
//
// Fluxo:
//   1. Carrega CloudAccount do DB
//   2. Descriptografa credenciais
//   3. Para cada region configurada, chama provider.listSubnets() e provider.listIps()
//   4. Reconcilia com DB: upsert subnets, upsert IPs, marca obsoletos
//   5. Cria CloudSyncRun com contadores e status
//
// Esta versão é READ-ONLY (não cria/deleta recurso no cloud, só lê).
// Write-mode (provisionar IP no cloud a partir do Bagre) é Phase 2.5 futura.

import { getProvider } from './index.js';
import { decryptCredentials } from './crypto.js';

/**
 * Run sync for one CloudAccount.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} cloudAccountId
 * @returns {Promise<{runId: number, summary: Record<string, number>}>}
 */
export async function runSync(prisma, cloudAccountId) {
  const account = await prisma.cloudAccount.findUniqueOrThrow({
    where: { id: cloudAccountId },
  });

  if (account.status === 'PAUSED' || account.status === 'DISABLED') {
    throw new Error(`CloudAccount ${cloudAccountId} is ${account.status} — skipping sync`);
  }

  const run = await prisma.cloudSyncRun.create({
    data: {
      cloudAccountId: account.id,
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });

  const summary = { itemsRead: 0, itemsCreated: 0, itemsUpdated: 0, itemsDeleted: 0 };

  try {
    const credentials = decryptCredentials(account.credentialsEnc);
    const provider = getProvider(account.provider);
    const sourceTag = `cloud:${provider.name}`;
    // Azure: subscription cobre todas regions automaticamente. AWS/GCP: itera.
    // Para Azure passamos uma única "region" dummy só pra reusar o loop.
    const regions = account.provider === 'AZURE'
      ? ['']
      : (account.regions?.length ? account.regions : ['us-east-1']);

    // Ensure a per-account site exists (one per CloudAccount keeps subnets
    // from different accounts isolated even within the same provider).
    const siteCode = `cloud-${provider.name}-${account.id}`;
    const site = await prisma.site.upsert({
      where: { code: siteCode },
      update: { name: `Cloud — ${account.displayName}` },
      create: {
        code: siteCode,
        name: `Cloud — ${account.displayName}`,
        description: `Auto-managed by cloud sync (account #${account.id}). Renomear/mover livremente.`,
      },
    });

    // Lazy-init the public IP pool subnet — IPs that have no native parent
    // (typical case: unassociated Elastic IPs). Created on first need.
    let publicPoolSubnet = null;
    async function getPublicPoolSubnet() {
      if (publicPoolSubnet) return publicPoolSubnet;
      const poolName = `${provider.name}-public-pool`;
      publicPoolSubnet = await prisma.subnet.upsert({
        where: { siteId_name: { siteId: site.id, name: poolName } },
        update: {
          source: sourceTag,
          cloudAccountId: account.id,
        },
        create: {
          siteId: site.id,
          name: poolName,
          // Public IP space is not a real CIDR — store null and convey purpose
          // via name + description. The IPs themselves carry the real address.
          cidr: null,
          description: 'Pool sintético para IPs públicos sem subnet nativa (Elastic IPs unassociated, etc). Base do relatório FinOps.',
          source: sourceTag,
          cloudAccountId: account.id,
        },
      });
      return publicPoolSubnet;
    }

    const seenSubnetIds = new Set();
    const seenIpKeys = new Set(); // subnetCloudId|address

    for (const region of regions) {
      // 1. Subnets — passa scope como 3º arg (Azure usa, AWS/GCP ignoram)
      const subnets = await provider.listSubnets(credentials, region, account.scope);
      summary.itemsRead += subnets.length;

      for (const ns of subnets) {
        seenSubnetIds.add(ns.cloudResourceId);
        const existing = await prisma.subnet.findFirst({
          where: { cloudResourceId: ns.cloudResourceId },
        });
        if (existing) {
          await prisma.subnet.update({
            where: { id: existing.id },
            data: {
              name: ns.name,
              cidr: ns.cidr,
              cloudMetadata: ns.metadata,
              source: sourceTag,
              cloudAccountId: account.id,
              updatedAt: new Date(),
            },
          });
          summary.itemsUpdated++;
        } else {
          await prisma.subnet.create({
            data: {
              siteId: site.id,
              name: ns.name,
              cidr: ns.cidr,
              source: sourceTag,
              cloudAccountId: account.id,
              cloudResourceId: ns.cloudResourceId,
              cloudMetadata: ns.metadata,
            },
          });
          summary.itemsCreated++;
        }
      }

      // 2. IPs
      const ips = await provider.listIps(credentials, region, account.scope);
      summary.itemsRead += ips.length;

      for (const nip of ips) {
        let subnetForIp = nip.subnetCloudId
          ? await prisma.subnet.findFirst({ where: { cloudResourceId: nip.subnetCloudId } })
          : null;

        if (!subnetForIp) {
          // Public IPs sem subnet nativa (Elastic IPs unassociated) — vão pro pool sintético.
          // Skipar IPs PRIVATE órfãos: indicam inconsistência (provider devolveu IP sem
          // parent subnet); logamos via metadata e seguimos.
          if (nip.kind === 'PUBLIC') {
            subnetForIp = await getPublicPoolSubnet();
          } else {
            continue;
          }
        }

        const key = `${subnetForIp.id}|${nip.address}`;
        seenIpKeys.add(key);

        const existing = await prisma.ipAddress.findFirst({
          where: { subnetId: subnetForIp.id, address: nip.address },
        });

        if (existing) {
          await prisma.ipAddress.update({
            where: { id: existing.id },
            data: {
              hostname: nip.hostname,
              ipKind: nip.kind,
              source: sourceTag,
              cloudAccountId: account.id,
              cloudResourceId: nip.cloudResourceId,
              cloudMetadata: nip.metadata,
              lastSeenAt: new Date(),
              lastSeenSource: sourceTag,
            },
          });
          summary.itemsUpdated++;
        } else {
          await prisma.ipAddress.create({
            data: {
              subnetId: subnetForIp.id,
              address: nip.address,
              hostname: nip.hostname,
              ipKind: nip.kind,
              status: 'USED',
              source: sourceTag,
              cloudAccountId: account.id,
              cloudResourceId: nip.cloudResourceId,
              cloudMetadata: nip.metadata,
              lastSeenAt: new Date(),
              lastSeenSource: sourceTag,
            },
          });
          summary.itemsCreated++;
        }
      }
    }

    // 3. Marcar obsoletos — items que existiam mas o cloud não retornou desta vez
    // (sinaliza que foram deletados/movidos no cloud)
    // Por ora, apenas conta. Estratégia de delete vem em Phase 2.5 polish.

    await prisma.cloudSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'ACTIVE',
        finishedAt: new Date(),
        ...summary,
      },
    });

    await prisma.cloudAccount.update({
      where: { id: account.id },
      data: {
        lastSyncAt: new Date(),
        lastError: null,
        status: 'ACTIVE',
      },
    });

    return { runId: run.id, summary };
  } catch (err) {
    await prisma.cloudSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'ERROR',
        finishedAt: new Date(),
        error: err.message || String(err),
        ...summary,
      },
    });
    await prisma.cloudAccount.update({
      where: { id: account.id },
      data: { lastError: err.message || String(err), status: 'ERROR' },
    });
    throw err;
  }
}
