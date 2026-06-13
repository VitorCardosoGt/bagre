#!/usr/bin/env node
// Pré-fiação do ambiente de demonstração (DEMO_MODE).
//
// Roda no boot do container `api` (depois de import.js, antes de index.js),
// SOMENTE quando DEMO_MODE=true. É idempotente — pode rodar a cada boot/reset.
//
//   1. Cria/atualiza usuários demo (admin + leitor) com senhas públicas de propósito.
//   2. Aponta a integração Zabbix para a instância in-stack (http://zabbix-web:8080).
//   3. Dispara uma sincronização inicial (com retry) para que os "pending
//      discoveries" já estejam presentes na primeira visita.
//
// Nunca derruba o boot: falhas de warm-up apenas logam; o scheduler do Zabbix
// (30s após o boot) recupera a sincronização sozinho.

import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { getConfig, syncFromZabbix } from '../src/integrations/zabbix.js';

const DEMO = process.env.DEMO_MODE === 'true';

const DEMO_ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'demo-admin@bagre.dev';
const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'demo-admin';
const DEMO_READER_EMAIL = process.env.DEMO_READER_EMAIL || 'demo-reader@bagre.dev';
const DEMO_READER_PASSWORD = process.env.DEMO_READER_PASSWORD || 'demo-reader';

const ZBX_URL = process.env.DEMO_ZABBIX_URL || 'http://zabbix-web:8080';
const ZBX_USER = process.env.DEMO_ZABBIX_USER || 'Admin';
const ZBX_PASS = process.env.DEMO_ZABBIX_PASS || 'zabbix';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upsertDemoUser(email, password, role) {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: role === 'ADMIN' ? 'Demo Admin' : 'Demo Leitor',
      passwordHash,
      role,
      active: true,
      mustChangePwd: false,
      authProvider: 'local',
    },
    update: {
      passwordHash,
      role,
      active: true,
      mustChangePwd: false,
    },
  });
  console.log(`[demo-seed] usuário ${role}: ${user.email}`);
}

async function wireZabbix() {
  // Singleton id=1 — mesmo padrão de getConfig()/syncFromZabbix().
  await prisma.zabbixConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      enabled: true,
      url: ZBX_URL,
      username: ZBX_USER,
      password: ZBX_PASS,
      intervalMinutes: 15,
      groupFilter: [],
    },
    update: {
      enabled: true,
      url: ZBX_URL,
      username: ZBX_USER,
      password: ZBX_PASS,
    },
  });
  console.log(`[demo-seed] Zabbix fixado em ${ZBX_URL}`);
}

async function initialZabbixSync() {
  // O Zabbix web demora 30-90s no primeiro boot, e o serviço one-shot
  // `zabbix-seed` popula os hosts em paralelo. Tentamos até ter hosts;
  // se não vier a tempo, o scheduler recupera depois.
  const maxAttempts = 18; // ~3 min com backoff de 10s
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const cfg = await getConfig();
      const result = await syncFromZabbix(cfg);
      if (result?.hosts > 0) {
        console.log(`[demo-seed] sync Zabbix OK — ${result.hosts} hosts processados`);
        return;
      }
      console.log(
        `[demo-seed] tentativa ${attempt}/${maxAttempts}: Zabbix sem hosts ainda` +
          (result?.skipped ? ` (${result.reason})` : ''),
      );
    } catch (err) {
      console.log(`[demo-seed] tentativa ${attempt}/${maxAttempts}: ${err.message}`);
    }
    if (attempt < maxAttempts) await sleep(10_000);
  }
  console.warn('[demo-seed] sync inicial sem hosts após retries — o scheduler vai recuperar');
}

async function main() {
  if (!DEMO) {
    console.log('[demo-seed] DEMO_MODE != true — nada a fazer.');
    return;
  }
  console.log('[demo-seed] preparando ambiente de demonstração…');
  await upsertDemoUser(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, 'ADMIN');
  await upsertDemoUser(DEMO_READER_EMAIL, DEMO_READER_PASSWORD, 'READER');
  await wireZabbix();
  await initialZabbixSync();
  console.log('[demo-seed] concluído.');
}

main()
  .catch((err) => {
    // Nunca falha o boot — apenas registra.
    console.error('[demo-seed] erro (ignorado para não bloquear o boot):', err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
