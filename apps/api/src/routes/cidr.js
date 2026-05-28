// CIDR utilities — split, merge, next-free.
//
// Split e merge são puramente matemáticos mas o backend é útil porque
// cruza com o estado real do IPAM (qual subnet já existe? está dentro
// de algum master range?).
//
// Endpoints:
//   GET  /api/cidr/parse?cidr=10.0.0.0/24             info básica + ocupação no IPAM
//   POST /api/cidr/split                              body: {cidr, prefix}
//   POST /api/cidr/merge                              body: {cidrs:[...]}
//   GET  /api/cidr/next-free?parent=...&prefix=N      sugere próximas subnets livres

import { requireAuth } from '../auth.js';
import { prisma } from '../db.js';

const CIDR_RE = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/;
const MAX_SPLIT_RESULTS = 4096;
const MAX_NEXT_FREE = 50;

// ---------- helpers IPv4 ----------

function ipToInt(ip) {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`IPv4 inválido: ${ip}`);
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function parseCidr(s) {
  if (!s) throw new Error('CIDR obrigatório');
  const m = String(s).trim().match(CIDR_RE);
  if (!m) throw new Error(`CIDR inválido: ${s}`);
  const prefix = Number(m[2]);
  if (prefix < 0 || prefix > 32) throw new Error(`Prefix inválido: /${prefix}`);
  const ipInt = ipToInt(m[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipInt & mask;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = prefix === 32 ? 1 : prefix === 31 ? 2 : broadcast - network + 1;
  const usable = prefix >= 31 ? total : Math.max(0, total - 2);
  return {
    cidr: `${intToIp(network)}/${prefix}`,
    prefix,
    networkInt: network,
    broadcastInt: broadcast,
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    mask: intToIp(mask),
    first: prefix >= 31 ? intToIp(network) : intToIp(network + 1),
    last: prefix >= 31 ? intToIp(broadcast) : intToIp(broadcast - 1),
    total,
    usable,
  };
}

/** True se A contém B (A é supernet de B). */
function contains(a, b) {
  return a.networkInt <= b.networkInt && b.broadcastInt <= a.broadcastInt;
}

/** True se A e B se sobrepõem. */
function overlaps(a, b) {
  return a.networkInt <= b.broadcastInt && b.networkInt <= a.broadcastInt;
}

// ---------- routes ----------

export async function registerCidrRoutes(app) {
  app.get('/api/cidr/parse', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const info = parseCidr(req.query.cidr);
      // Cruza com IPAM: subnets que sobrepõem este CIDR
      const subnets = await prisma.subnet.findMany({
        where: { cidr: { not: null } },
        select: { id: true, name: true, cidr: true, siteId: true },
      });
      const overlapping = [];
      for (const s of subnets) {
        try {
          const sInfo = parseCidr(s.cidr);
          if (overlaps(info, sInfo)) {
            overlapping.push({
              id: s.id,
              name: s.name,
              cidr: s.cidr,
              relation: contains(info, sInfo) ? 'subnet-of-input' : contains(sInfo, info) ? 'supernet-of-input' : 'partial-overlap',
            });
          }
        } catch {
          // skip invalid CIDR in DB
        }
      }
      const masters = await prisma.masterRange.findMany({ select: { cidr: true, description: true, category: true } });
      const masterMatches = [];
      for (const m of masters) {
        try {
          const mInfo = parseCidr(m.cidr);
          if (contains(mInfo, info)) {
            masterMatches.push({ cidr: m.cidr, description: m.description, category: m.category });
          }
        } catch {
          // skip
        }
      }
      const { networkInt, broadcastInt, ...safe } = info;
      return { ...safe, overlappingSubnets: overlapping, withinMasters: masterMatches };
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }
  });

  app.post('/api/cidr/split', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const { cidr, prefix } = req.body || {};
      const parent = parseCidr(cidr);
      const target = Number(prefix);
      if (!Number.isInteger(target) || target < 0 || target > 32) {
        throw new Error('prefix alvo inválido');
      }
      if (target < parent.prefix) {
        throw new Error(`prefix alvo /${target} é maior que o parent /${parent.prefix}`);
      }
      const count = target === parent.prefix ? 1 : 2 ** (target - parent.prefix);
      if (count > MAX_SPLIT_RESULTS) {
        throw new Error(`split geraria ${count.toLocaleString()} subnets — limite ${MAX_SPLIT_RESULTS}`);
      }
      const blockSize = 2 ** (32 - target);

      // Carrega subnets existentes pra marcar conflitos
      const existing = await prisma.subnet.findMany({
        where: { cidr: { not: null } },
        select: { id: true, name: true, cidr: true },
      });
      const existingInfo = existing
        .map((s) => {
          try { return { ...s, info: parseCidr(s.cidr) }; } catch { return null; }
        })
        .filter(Boolean);

      const results = [];
      for (let i = 0; i < count; i++) {
        const netInt = (parent.networkInt + i * blockSize) >>> 0;
        const cidrStr = `${intToIp(netInt)}/${target}`;
        const childInfo = parseCidr(cidrStr);
        const conflicts = existingInfo
          .filter((e) => overlaps(childInfo, e.info))
          .map((e) => ({ id: e.id, name: e.name, cidr: e.cidr }));
        results.push({
          cidr: cidrStr,
          network: intToIp(netInt),
          broadcast: intToIp((netInt + blockSize - 1) >>> 0),
          usable: target >= 31 ? blockSize : Math.max(0, blockSize - 2),
          inUse: conflicts.length > 0,
          conflicts,
        });
      }
      return {
        parent: parent.cidr,
        targetPrefix: target,
        count,
        results,
      };
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }
  });

  app.post('/api/cidr/merge', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const cidrs = Array.isArray(req.body?.cidrs) ? req.body.cidrs : [];
      if (cidrs.length < 1) throw new Error('lista de cidrs vazia');
      if (cidrs.length > 256) throw new Error('máximo 256 CIDRs por chamada');
      const infos = cidrs.map(parseCidr);
      const minNet = Math.min(...infos.map((i) => i.networkInt));
      const maxBcast = Math.max(...infos.map((i) => i.broadcastInt));
      // Encontra o menor prefix tal que o bloco aligned cobre [minNet, maxBcast]
      let prefix = 32;
      while (prefix > 0) {
        const blockSize = 2 ** (32 - prefix);
        const alignedStart = Math.floor(minNet / blockSize) * blockSize;
        const alignedEnd = (alignedStart + blockSize - 1) >>> 0;
        if (alignedStart <= minNet && alignedEnd >= maxBcast) break;
        prefix--;
      }
      const blockSize = 2 ** (32 - prefix);
      const networkInt = Math.floor(minNet / blockSize) * blockSize;
      const result = parseCidr(`${intToIp(networkInt)}/${prefix}`);
      // Verifica se o supernet realmente CONTÉM todos os inputs
      const allContained = infos.every((i) => contains(result, i));
      const { networkInt: _n, broadcastInt: _b, ...safe } = result;
      return {
        inputCount: cidrs.length,
        supernet: safe,
        allContained,
        warning: allContained ? null : 'inputs não estão dentro de um único supernet — verifique alinhamento',
      };
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }
  });

  app.get('/api/cidr/next-free', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const parent = parseCidr(req.query.parent);
      const target = Number(req.query.prefix);
      if (!Number.isInteger(target) || target < 0 || target > 32) {
        throw new Error('prefix alvo inválido');
      }
      if (target < parent.prefix) {
        throw new Error(`prefix alvo /${target} é maior que o parent /${parent.prefix}`);
      }
      const limit = Math.min(Number(req.query.limit) || 10, MAX_NEXT_FREE);
      const blockSize = 2 ** (32 - target);
      const totalSlots = target === parent.prefix ? 1 : 2 ** (target - parent.prefix);
      if (totalSlots > MAX_SPLIT_RESULTS) {
        throw new Error(`espaço de busca ${totalSlots.toLocaleString()} excede limite`);
      }

      const existing = await prisma.subnet.findMany({
        where: { cidr: { not: null } },
        select: { cidr: true },
      });
      const existingInfo = existing
        .map((s) => { try { return parseCidr(s.cidr); } catch { return null; } })
        .filter(Boolean);

      const free = [];
      for (let i = 0; i < totalSlots && free.length < limit; i++) {
        const netInt = (parent.networkInt + i * blockSize) >>> 0;
        const cidrStr = `${intToIp(netInt)}/${target}`;
        const candidate = parseCidr(cidrStr);
        const collides = existingInfo.some((e) => overlaps(candidate, e));
        if (!collides) {
          free.push({
            cidr: cidrStr,
            network: intToIp(netInt),
            broadcast: intToIp((netInt + blockSize - 1) >>> 0),
            usable: target >= 31 ? blockSize : Math.max(0, blockSize - 2),
          });
        }
      }
      return {
        parent: parent.cidr,
        targetPrefix: target,
        totalSlots,
        examined: Math.min(totalSlots, MAX_SPLIT_RESULTS),
        freeFound: free.length,
        limit,
        results: free,
      };
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }
  });
}
