import { runImport, importSeed } from '../import.js';
import { requireAdmin } from '../auth.js';
import xlsx from 'xlsx';

// ============ Helpers para converter formatos diversos pra seed shape ============

/**
 * Parser CSV mínimo (sem escape complexo — IPAM tipicamente não tem aspas
 * aninhadas nem vírgulas em campos). Retorna { headers: string[], rows: object[] }.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line) => {
    // Suporte mínimo a campos entre aspas (preserva vírgulas internas)
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const v = cells[j];
      if (v != null && v !== '') obj[headers[j]] = v;
    }
    if (Object.keys(obj).length) rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Converte linhas CSV tabulares (1 IP por linha) em seed shape.
 * Colunas reconhecidas (case-insensitive, espaços viram underscore):
 *   site_code, site_name, subnet_name, subnet_cidr, subnet_vlan,
 *   address, hostname, type, function, status, notes
 */
function csvRowsToSeed(rows) {
  const sitesByCode = new Map();
  let totalIps = 0;
  for (const r of rows) {
    const siteCode = r.site_code || r.site || 'UNKNOWN';
    const siteName = r.site_name || siteCode;
    const subnetName = r.subnet_name || r.subnet || 'default';
    const subnetCidr = r.subnet_cidr || r.cidr || null;
    const subnetVlan = r.subnet_vlan || r.vlan || null;
    const address = r.address || r.ip || null;

    let site = sitesByCode.get(siteCode);
    if (!site) {
      site = { code: siteCode, name: siteName, subnets: [] };
      sitesByCode.set(siteCode, site);
    }
    let subnet = site.subnets.find((s) => s.name === subnetName);
    if (!subnet) {
      subnet = {
        name: subnetName,
        cidr: subnetCidr,
        vlan_id: subnetVlan ? Number(subnetVlan) : null,
        ips: [],
      };
      site.subnets.push(subnet);
    }
    if (address) {
      subnet.ips.push({
        address,
        hostname: r.hostname || null,
        type: r.type || null,
        function: r.function || null,
        status: r.status || (r.hostname || r.type ? 'USED' : 'FREE'),
        notes: r.notes || null,
      });
      totalIps++;
    }
  }
  return { seed: { sites: Array.from(sitesByCode.values()) }, totalIps };
}

/** Parse XLSX uploaded buffer — first sheet treated as CSV-like with header. */
function xlsxBufferToSeed(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { seed: { sites: [] }, totalIps: 0 };
  const sheet = wb.Sheets[sheetName];
  // sheet_to_json: header: 1 → array de arrays; sem isso usa primeira linha como header.
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  // Normaliza keys (lowercase + underscore) pra alinhar com csvRowsToSeed
  const normalized = rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      o[String(k).toLowerCase().replace(/\s+/g, '_')] = v;
    }
    return o;
  });
  return csvRowsToSeed(normalized);
}

// ============ Routes ============

export async function registerImport(app) {
  // Legacy — usa o seed.json mountado no container
  app.post('/api/import/seed', async (req, reply) => {
    const token = req.headers['x-admin-token'];
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      reply.code(403);
      return { error: 'invalid admin token' };
    }
    const stats = await runImport('/app/seed.json');
    return stats;
  });

  // Universal — aceita upload (multipart) OU JSON body inline.
  // Detecta formato:
  //   - JSON body (Content-Type: application/json) → trata como seed shape
  //   - multipart com file=<name>.json → idem
  //   - multipart com file=<name>.csv  → converte tabular → seed
  //   - multipart com file=<name>.xlsx → idem (primeira aba)
  app.post('/api/import', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      let seed = null;
      let sourceFormat = 'json';

      if (ct.includes('multipart/form-data')) {
        const part = await req.file({ limits: { fileSize: 25 * 1024 * 1024 } });
        if (!part) {
          reply.code(400);
          return { error: 'envie um arquivo no campo `file`' };
        }
        const filename = String(part.filename || '').toLowerCase();
        const buf = await part.toBuffer();
        if (filename.endsWith('.csv')) {
          sourceFormat = 'csv';
          const { rows } = parseCsv(buf.toString('utf8'));
          const { seed: s, totalIps } = csvRowsToSeed(rows);
          seed = s;
          seed._imported = { rows: rows.length, ips: totalIps };
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
          sourceFormat = 'xlsx';
          const { seed: s, totalIps } = xlsxBufferToSeed(buf);
          seed = s;
          seed._imported = { ips: totalIps };
        } else if (filename.endsWith('.json')) {
          sourceFormat = 'json';
          seed = JSON.parse(buf.toString('utf8'));
        } else {
          reply.code(400);
          return { error: `formato não suportado: ${filename}. Use .json, .csv, .xlsx` };
        }
      } else if (ct.includes('application/json')) {
        seed = req.body || {};
      } else {
        reply.code(400);
        return { error: 'envie multipart/form-data com `file` ou JSON body com seed shape' };
      }

      const stats = await importSeed(seed);
      return { ok: true, sourceFormat, ...stats };
    } catch (err) {
      reply.code(400);
      return { error: err.message };
    }
  });
}
