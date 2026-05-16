// Migration one-shot: agrupa IpAddress por hostname e cria Devices.
// Idempotente: pular IPs que já têm deviceId; reusar Device existente por nome.
// Rodar: docker compose exec api node scripts/migrate-devices.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalize(h) {
  if (!h) return null;
  const t = String(h).trim().toLowerCase();
  return t || null;
}

async function main() {
  const total = await prisma.ipAddress.count();
  const withDevice = await prisma.ipAddress.count({ where: { deviceId: { not: null } } });
  const withHost = await prisma.ipAddress.count({
    where: { hostname: { not: null }, NOT: { hostname: '' } },
  });
  console.log(`[migrate-devices] total IPs=${total}, com hostname=${withHost}, já vinculados=${withDevice}`);

  // Busca IPs com hostname e ainda sem deviceId
  const ips = await prisma.ipAddress.findMany({
    where: {
      deviceId: null,
      hostname: { not: null },
      NOT: { hostname: '' },
    },
    include: { subnet: { select: { siteId: true } } },
    orderBy: { id: 'asc' },
  });
  console.log(`[migrate-devices] candidatos a agrupar=${ips.length}`);

  // Agrupa por hostname normalizado
  const groups = new Map();
  for (const ip of ips) {
    const key = normalize(ip.hostname);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ip);
  }
  console.log(`[migrate-devices] grupos únicos de hostname=${groups.size}`);

  let devicesCreated = 0;
  let devicesReused = 0;
  let ipsLinked = 0;

  for (const [key, group] of groups) {
    const primary = group[0]; // usa o primeiro IP como template do Device
    const displayName = primary.hostname.trim();
    // Vê se já existe Device com esse nome (case-insensitive)
    let device = await prisma.device.findFirst({
      where: { name: { equals: displayName, mode: 'insensitive' } },
    });
    if (device) {
      devicesReused++;
    } else {
      device = await prisma.device.create({
        data: {
          name: displayName,
          type: primary.type,
          vendor: primary.vendor,
          model: primary.model,
          osInfo: primary.osInfo,
          role: primary.function,
          siteId: primary.subnet?.siteId ?? null,
          externalRef: primary.externalRef,
          lastSeenAt: primary.lastSeenAt,
        },
      });
      devicesCreated++;
    }
    // Vincula todos os IPs do grupo
    const ids = group.map((g) => g.id);
    const upd = await prisma.ipAddress.updateMany({
      where: { id: { in: ids } },
      data: { deviceId: device.id },
    });
    ipsLinked += upd.count;
  }

  // Resumo final via SQL pra confirmar
  const finalDevices = await prisma.device.count();
  const finalLinked = await prisma.ipAddress.count({ where: { deviceId: { not: null } } });
  const stillOrphanWithHost = await prisma.ipAddress.count({
    where: {
      deviceId: null,
      hostname: { not: null },
      NOT: { hostname: '' },
    },
  });

  console.log('---');
  console.log(`Devices criados: ${devicesCreated}`);
  console.log(`Devices reusados: ${devicesReused}`);
  console.log(`IPs vinculados nesta execução: ${ipsLinked}`);
  console.log('---');
  console.log(`Total Devices na base agora: ${finalDevices}`);
  console.log(`Total IPs com deviceId: ${finalLinked}`);
  console.log(`IPs com hostname ainda sem deviceId: ${stillOrphanWithHost} (deveria ser 0)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
