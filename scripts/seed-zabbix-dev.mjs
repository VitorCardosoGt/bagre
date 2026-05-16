#!/usr/bin/env node
// Popula o Zabbix dev com hosts realistas (inventário completo: OS, vendor, model, MAC).
//
// Run: node scripts/seed-zabbix-dev.mjs

const ZBX = process.env.ZBX_URL || 'http://localhost:8080';
const USER = process.env.ZBX_USER || 'Admin';
const PASS = process.env.ZBX_PASS || 'zabbix';

const ENDPOINT = ZBX.replace(/\/$/, '') + '/api_jsonrpc.php';

// Hosts com inventário rico para a demo
const HOSTS = [
  // ---- Servidores Linux ----
  {
    ip: '10.150.0.10', name: 'srv-prd-web-01', group: 'Production',
    os: 'Ubuntu 22.04 LTS', vendor: 'Dell', model: 'PowerEdge R740',
    type: 'Servidor', mac: '00:1A:A0:11:22:01',
  },
  {
    ip: '10.150.0.11', name: 'srv-prd-web-02', group: 'Production',
    os: 'Ubuntu 22.04 LTS', vendor: 'Dell', model: 'PowerEdge R740',
    type: 'Servidor', mac: '00:1A:A0:11:22:02',
  },
  {
    ip: '10.150.0.12', name: 'srv-prd-db-01', group: 'Production',
    os: 'Red Hat Enterprise Linux 9', vendor: 'HP', model: 'ProLiant DL380',
    type: 'Servidor', mac: '00:25:B5:33:44:01',
  },
  {
    ip: '10.150.1.20', name: 'srv-sdx-app-01', group: 'Sandbox',
    os: 'Debian 12', vendor: 'Dell', model: 'PowerEdge R640',
    type: 'Servidor', mac: '00:1A:A0:11:22:03',
  },
  // ---- Servidor Windows ----
  {
    ip: '10.150.2.30', name: 'srv-tre-test-01', group: 'Treinamento',
    os: 'Windows Server 2022 Datacenter', vendor: 'Microsoft', model: 'Hyper-V VM',
    type: 'Servidor', mac: '00:15:5D:99:88:01',
  },
  // ---- Outros servidores ----
  {
    ip: '10.150.10.5', name: 'srv-core-prd-01', group: 'Production',
    os: 'Ubuntu 22.04 LTS', vendor: 'Dell', model: 'PowerEdge R750',
    type: 'Servidor', mac: '00:1A:A0:55:66:01',
  },
  {
    ip: '10.150.10.6', name: 'srv-core-prd-02', group: 'Production',
    os: 'Windows Server 2019', vendor: 'HP', model: 'ProLiant DL360',
    type: 'Servidor', mac: '00:25:B5:55:66:02',
  },
  // ---- Switch core ----
  {
    ip: '10.150.20.10', name: 'sw-rack-duo-01', group: 'Network',
    os: 'Cisco IOS 17.6', vendor: 'Cisco', model: 'Catalyst 9300',
    type: 'Switch', mac: 'F4:1F:C2:AB:CD:01',
  },
  // ---- Roteador / Firewall ----
  {
    ip: '10.230.1.1', name: 'fw-duo-edge-01', group: 'Network',
    os: 'FortiOS 7.4', vendor: 'Fortinet', model: 'FortiGate 100F',
    type: 'Firewall', mac: '00:09:0F:AA:BB:01',
  },
  {
    ip: '10.230.1.50', name: 'srv-duo-mgmt', group: 'Management',
    os: 'Ubuntu 22.04 LTS', vendor: 'Dell', model: 'PowerEdge R650',
    type: 'Servidor', mac: '00:1A:A0:77:88:01',
  },
  {
    ip: '10.230.1.51', name: 'srv-duo-monitoring', group: 'Management',
    os: 'Ubuntu 22.04 LTS', vendor: 'Dell', model: 'PowerEdge R650',
    type: 'Servidor', mac: '00:1A:A0:77:88:02',
  },
  // ---- App / DB ----
  {
    ip: '10.230.2.10', name: 'srv-duo-prd-app', group: 'Production',
    os: 'Ubuntu 22.04 LTS', vendor: 'Dell', model: 'PowerEdge R740',
    type: 'Servidor', mac: '00:1A:A0:99:00:01',
  },
  {
    ip: '10.230.2.11', name: 'srv-duo-prd-db', group: 'Production',
    os: 'Red Hat Enterprise Linux 9', vendor: 'HP', model: 'ProLiant DL380',
    type: 'Servidor', mac: '00:25:B5:99:00:02',
  },
  // ---- Workstations ----
  {
    ip: '192.168.110.20', name: 'pc-morumbi-01', group: 'Workstations',
    os: 'Windows 11 Pro', vendor: 'Lenovo', model: 'ThinkPad T14',
    type: 'Workstation', mac: '8C:8C:AA:11:22:01',
  },
  {
    ip: '192.168.110.21', name: 'pc-morumbi-02', group: 'Workstations',
    os: 'macOS 14.5', vendor: 'Apple', model: 'MacBook Pro 14',
    type: 'Workstation', mac: '14:7D:DA:33:44:01',
  },
  // ---- Files server ----
  {
    ip: '192.168.111.10', name: 'srv-morumbi-files', group: 'Production',
    os: 'Windows Server 2019', vendor: 'Dell', model: 'PowerEdge T440',
    type: 'Servidor', mac: '00:1A:A0:55:55:01',
  },
  // ---- "Fantasma" — IP fora dos ranges cadastrados no IPAM ----
  {
    ip: '172.16.99.99', name: 'srv-orphan-01', group: 'Production',
    os: 'Ubuntu 20.04', vendor: 'Dell', model: 'PowerEdge R640',
    type: 'Servidor', mac: '00:1A:A0:FF:FF:99',
  },
];

let auth = null;

async function rpc(method, params = {}, useAuth = true) {
  const body = { jsonrpc: '2.0', method, params, id: Date.now() };
  if (useAuth && auth) body.auth = auth;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json-rpc' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message} ${json.error.data || ''}`);
  return json.result;
}

async function login() {
  auth = await rpc('user.login', { username: USER, password: PASS }, false);
  console.log('Logged in to Zabbix');
}

async function ensureGroup(name) {
  const existing = await rpc('hostgroup.get', { filter: { name } });
  if (existing.length) return existing[0].groupid;
  const r = await rpc('hostgroup.create', { name });
  return r.groupids[0];
}

async function upsertHost(host, groupid) {
  const inventory = {
    os: host.os,
    os_full: host.os,
    type: host.type,
    vendor: host.vendor,
    model: host.model,
    macaddress_a: host.mac,
  };
  const interfaces = [
    { type: 1, main: 1, useip: 1, ip: host.ip, dns: '', port: '10050' },
  ];
  const existing = await rpc('host.get', { filter: { host: host.name } });
  if (existing.length) {
    const hostid = existing[0].hostid;
    await rpc('host.update', {
      hostid,
      name: host.name,
      inventory_mode: 1, // manual
      inventory,
    });
    console.log(`  updated: ${host.name} (${host.ip}) · ${host.type} ${host.os}`);
    return hostid;
  }
  const r = await rpc('host.create', {
    host: host.name,
    name: host.name,
    interfaces,
    groups: [{ groupid }],
    inventory_mode: 1,
    inventory,
  });
  console.log(`  created: ${host.name} (${host.ip}) · ${host.type} ${host.os}`);
  return r.hostids[0];
}

async function main() {
  console.log(`Seeding Zabbix at ${ZBX}`);
  await login();
  const groups = {};
  for (const h of HOSTS) {
    if (!groups[h.group]) groups[h.group] = await ensureGroup(h.group);
  }
  for (const h of HOSTS) {
    await upsertHost(h, groups[h.group]);
  }
  console.log('\nDone. URL: ' + ZBX + '   User: ' + USER + '   Pass: ' + PASS);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
