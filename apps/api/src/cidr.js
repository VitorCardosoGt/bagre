// Pure helpers for IPv4 CIDR math.
// Used to enumerate IPs when a new subnet is created.

const IPV4_CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function parseCidr(cidr) {
  const m = cidr && cidr.match(IPV4_CIDR_RE);
  if (!m) return null;
  const ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
  const prefix = Number(m[5]);
  if (prefix < 0 || prefix > 32) return null;
  for (const o of [m[1], m[2], m[3], m[4]]) {
    if (Number(o) > 255) return null;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipToInt(ip) & mask;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network, broadcast, prefix, mask };
}

/**
 * Returns all IPv4 addresses in the CIDR. By default skips the network and
 * broadcast addresses for prefixes <= 30 (matching the spreadsheet's behavior
 * of listing 254 hosts in a /24). For /31 and /32, returns all addresses.
 *
 * Hard-capped at 4096 addresses to keep DB inserts sane.
 */
export function expandCidr(cidr, { includeNetwork = false, includeBroadcast = false } = {}) {
  const parsed = parseCidr(cidr);
  if (!parsed) return [];
  const { network, broadcast, prefix } = parsed;
  const total = broadcast - network + 1;
  if (total > 4096) {
    throw new Error(
      `CIDR ${cidr} expandiria para ${total} IPs — limite é 4096. Quebre em subnets menores.`,
    );
  }
  let start = network;
  let end = broadcast;
  if (prefix < 31) {
    if (!includeNetwork) start = network + 1;
    if (!includeBroadcast) end = broadcast - 1;
  }
  const out = [];
  for (let n = start; n <= end; n++) out.push(intToIp(n));
  return out;
}
