// Import seed.json -> database. Idempotent (upsert-based).
//
// Usage:
//   node src/import.js [path-to-seed.json]
//
// Default path: /app/seed.json (mounted in docker-compose)

import { readFile, stat } from 'node:fs/promises';
import { prisma } from './db.js';

const CIDR_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2})/;
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function cleanSubnetName(raw, siteCode) {
  if (!raw) return null;
  let s = raw.trim();
  // Drop common prefixes from the spreadsheet
  s = s.replace(/^CONTROLE DE IP - /i, '');
  s = s.replace(/^CONTROLE DE IP SP3 - /i, 'SP3-');
  return s;
}

function inferStatusFromRow(row) {
  if (row.hostname || row.type || row.function) return 'USED';
  return 'FREE';
}

function parseRangeLabel(label, ipsCount) {
  if (!label) return { cidr: null };
  const m = label.match(CIDR_RE);
  if (m) return { cidr: m[1] };
  // No mask in label — guess /24 if there are ~254 IPs
  const ipMatch = label.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (ipMatch && ipsCount >= 250) {
    return { cidr: `${ipMatch[1].replace(/\.\d+$/, '.0')}/24` };
  }
  return { cidr: null };
}

export async function runImport(path = '/app/seed.json', { ifEmpty = false } = {}) {
  if (ifEmpty) {
    const existing = await prisma.site.count();
    if (existing > 0) {
      console.log(`Import skipped: ${existing} site(s) already in DB.`);
      return { skipped: true, existingSites: existing };
    }
    let s;
    try {
      s = await stat(path);
    } catch {
      console.log(`Import skipped: no seed file at ${path}.`);
      return { skipped: true, reason: 'no-seed-file' };
    }
    if (!s.isFile()) {
      console.log(`Import skipped: ${path} is not a file (likely an empty bind mount).`);
      return { skipped: true, reason: 'not-a-file' };
    }
  }
  const raw = await readFile(path, 'utf8');
  const seed = JSON.parse(raw);
  const stats = {
    sites: 0,
    subnets: 0,
    ips: 0,
    masterRanges: 0,
    equinixVlans: 0,
    azureSubnets: 0,
    firewallRules: 0,
    cidrRefs: 0,
  };

  // Sites + subnets + ips
  for (const site of seed.sites || []) {
    const dbSite = await prisma.site.upsert({
      where: { code: site.code },
      update: { name: site.name },
      create: { code: site.code, name: site.name },
    });
    stats.sites++;

    for (const sub of site.subnets || []) {
      const cleanName = cleanSubnetName(sub.name, site.code);
      const cidrPrimary =
        (sub.cidrs && sub.cidrs[0]) || parseRangeLabel(sub.range_label, sub.ips?.length || 0).cidr;
      const cidrLabel = sub.range_label || (sub.cidrs ? sub.cidrs.join(', ') : null);

      const dbSub = await prisma.subnet.upsert({
        where: { siteId_name: { siteId: dbSite.id, name: cleanName } },
        update: { cidr: cidrPrimary, cidrLabel },
        create: {
          siteId: dbSite.id,
          name: cleanName,
          cidr: cidrPrimary,
          cidrLabel,
        },
      });
      stats.subnets++;

      // Bulk upsert IPs - we use createMany with skipDuplicates and a follow-up
      // update for any IPs that already exist with new metadata.
      const toStr = (v) => (v === null || v === undefined || v === '' ? null : String(v));
      const rows = (sub.ips || [])
        .filter((r) => r.address && IPV4_RE.test(r.address))
        .map((r) => ({
          subnetId: dbSub.id,
          address: r.address,
          type: toStr(r.type),
          hostname: toStr(r.hostname),
          function: toStr(r.function),
          status: inferStatusFromRow(r),
        }));

      // First insert any missing rows
      if (rows.length) {
        await prisma.ipAddress.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }

      // Then refresh metadata for existing rows
      for (const r of rows) {
        if (r.hostname || r.type || r.function) {
          await prisma.ipAddress.update({
            where: { subnetId_address: { subnetId: dbSub.id, address: r.address } },
            data: {
              type: r.type,
              hostname: r.hostname,
              function: r.function,
              status: r.status,
            },
          });
        }
      }
      stats.ips += rows.length;
    }
  }

  // Master ranges
  for (const r of seed.master_ranges || []) {
    if (!r.cidr) continue;
    await prisma.masterRange.upsert({
      where: { cidr_description: { cidr: r.cidr, description: r.description || '' } },
      update: {},
      create: { cidr: r.cidr, description: r.description || '' },
    });
    stats.masterRanges++;
  }

  // Equinix vlans (simple wipe + recreate; small dataset)
  if (seed.equinix_vlans?.length) {
    await prisma.equinixVlan.deleteMany();
    for (const v of seed.equinix_vlans) {
      await prisma.equinixVlan.create({
        data: {
          name: v.name || '(sem nome)',
          vlanId: typeof v.vlan_id === 'number' ? v.vlan_id : null,
          network: v.network ? String(v.network) : null,
          usage: v.usage || null,
          broadcast: v.broadcast ? String(v.broadcast) : null,
        },
      });
      stats.equinixVlans++;
    }
  }

  if (seed.azure_subnets?.length) {
    await prisma.azureSubnet.deleteMany();
    for (const v of seed.azure_subnets) {
      await prisma.azureSubnet.create({
        data: {
          name: v.name || '(sem nome)',
          network: v.network ? String(v.network) : null,
          usage: v.usage || null,
          broadcast: v.broadcast ? String(v.broadcast) : null,
        },
      });
      stats.azureSubnets++;
    }
  }

  if (seed.firewall_rules?.length) {
    await prisma.firewallRule.deleteMany();
    for (const r of seed.firewall_rules) {
      await prisma.firewallRule.create({
        data: {
          direction: r.direction || null,
          inIface: r.in_iface || null,
          outIface: r.out_iface || null,
          src: r.src || null,
          dst: r.dst || null,
          port: r.port ? String(r.port) : null,
          service: r.service || null,
          protocol: r.protocol || null,
        },
      });
      stats.firewallRules++;
    }
  }

  if (seed.cidr_reference?.length) {
    for (const r of seed.cidr_reference) {
      await prisma.cidrReference.upsert({
        where: { prefix: r.prefix },
        update: {
          mask: r.mask ? String(r.mask) : null,
          total: typeof r.total === 'number' ? r.total : null,
          usable: typeof r.usable === 'number' ? r.usable : null,
          networksPer24: r.networks_per_24 ? String(r.networks_per_24) : null,
        },
        create: {
          prefix: r.prefix,
          mask: r.mask ? String(r.mask) : null,
          total: typeof r.total === 'number' ? r.total : null,
          usable: typeof r.usable === 'number' ? r.usable : null,
          networksPer24: r.networks_per_24 ? String(r.networks_per_24) : null,
        },
      });
      stats.cidrRefs++;
    }
  }

  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ifEmpty = args.includes('--if-empty');
  const path = args.find((a) => !a.startsWith('--')) || '/app/seed.json';
  runImport(path, { ifEmpty })
    .then((s) => {
      console.log('Import OK', s);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('Import failed', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
