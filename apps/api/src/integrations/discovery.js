// Discovery pipeline shared por todas as integrações que descobrem hosts
// (Zabbix, Prometheus, futuros: Nmap, Cloud probes, etc).
//
// Cada integração coleta hosts no seu protocolo nativo, normaliza pro shape
// abaixo, e chama applyDiscoveries(source, items). Esta função:
//   - filtra IPs públicos (não vão pra fila de aprovação)
//   - filtra hosts sem hostname
//   - se o IP já existe em alguma subnet do IPAM → atualiza inline
//   - se NÃO existe → joga em PendingDiscovery pra admin aprovar
//
// Shape de um item de discovery:
// {
//   address:       "10.0.0.10",        // obrigatório, IPv4
//   hostname:      "srv-app01",        // obrigatório (vazio = skip)
//   type:          "Servidor Linux",   // opcional
//   function:      "Production",       // opcional (label/group)
//   status:        "USED" | "RESERVED", // opcional, default USED
//   externalRef:   "zabbix:host:1042", // opcional
//   macAddress:    "AA:BB:CC:DD:EE:FF",// opcional
//   osInfo:        "Ubuntu 22.04",     // opcional
//   vendor:        "Dell",             // opcional
//   model:         "PowerEdge R740",   // opcional
// }

import { prisma } from '../db.js';

/** Verifica se o IP é RFC1918 (privado). */
export function isPrivateIPv4(addr) {
  const parts = addr.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Heurística: sugere subnet /24 a partir de um IP. */
export function suggestSubnet24(addr) {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Apply discoveries to IPAM in bulk.
 * @param {string} source — identificador da origem ("zabbix", "prometheus", etc).
 *                          Vai para PendingDiscovery.source, IpAddress.lastSeenSource
 *                          e o stats por source.
 * @param {Array<DiscoveryItem>} discoveries
 * @returns {Promise<{received:number, updated:number, pendingCreated:number,
 *   pendingUpdated:number, skippedPublic:number, skippedNoHostname:number,
 *   ghosts:string[], errors:object[]}>}
 */
export async function applyDiscoveries(source, discoveries) {
  const stats = {
    received: discoveries.length,
    updated: 0,
    pendingCreated: 0,
    pendingUpdated: 0,
    skippedPublic: 0,
    skippedNoHostname: 0,
    ghosts: [],
    errors: [],
  };
  const now = new Date();
  for (const it of discoveries) {
    try {
      if (!isPrivateIPv4(it.address)) {
        stats.skippedPublic++;
        continue;
      }
      if (!it.hostname || !String(it.hostname).trim()) {
        stats.skippedNoHostname++;
        continue;
      }

      const matches = await prisma.ipAddress.findMany({
        where: { address: it.address },
      });

      if (matches.length === 0) {
        // IP não está em nenhuma subnet do IPAM → fila de aprovação
        const pendingData = {
          source,
          address: it.address,
          externalRef: it.externalRef || null,
          hostname: it.hostname || null,
          type: it.type || null,
          vendor: it.vendor || null,
          model: it.model || null,
          osInfo: it.osInfo || null,
          macAddress: it.macAddress || null,
          function: it.function || null,
          suggestedSubnetCidr: suggestSubnet24(it.address),
          lastSeenAt: now,
        };
        const existing = await prisma.pendingDiscovery.findUnique({
          where: { source_address: { source, address: it.address } },
        });
        if (existing) {
          if (existing.status === 'PENDING') {
            await prisma.pendingDiscovery.update({
              where: { id: existing.id },
              data: { ...pendingData, occurrences: { increment: 1 } },
            });
            stats.pendingUpdated++;
          }
          // Se já foi APPROVED/REJECTED, não mexe (admin já decidiu)
        } else {
          await prisma.pendingDiscovery.create({ data: pendingData });
          stats.pendingCreated++;
        }
        stats.ghosts.push(it.address);
        continue;
      }

      // IP existe → atualizar (fluxo automático, sem aprovação)
      const data = {
        type: it.type || null,
        hostname: it.hostname || null,
        function: it.function || null,
        status: it.status || 'USED',
        macAddress: it.macAddress || null,
        osInfo: it.osInfo || null,
        vendor: it.vendor || null,
        model: it.model || null,
        lastSeenAt: now,
        lastSeenSource: source,
        externalRef: it.externalRef || null,
      };
      for (const m of matches) {
        await prisma.ipAddress.update({ where: { id: m.id }, data });
      }
      stats.updated += matches.length;
    } catch (err) {
      stats.errors.push({ address: it.address, reason: err.message });
    }
  }
  return stats;
}
