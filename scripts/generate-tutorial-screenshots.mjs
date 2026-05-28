#!/usr/bin/env node
// Gera screenshots e markdown dos tutoriais do Bagre.
//
// Pré-requisitos:
//   1. Stack rodando: docker compose up -d
//   2. Playwright instalado: npm i -D playwright
//   3. (opcional) Variáveis BAGRE_URL e BAGRE_PASSWORD se diferentes do default
//
// Uso:
//   node scripts/generate-tutorial-screenshots.mjs [tutorial-id]
//   tutorials: quickstart, connect-aws, zabbix, prometheus, dns, cidr-calc, bulk-ops
//
// Output:
//   docs/tutorials/<id>/screenshots/01-*.png ... NN-*.png
//   docs/tutorials/<id>/README.md (markdown gerado com narrativa + imagens)

import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const URL_BASE = process.env.BAGRE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.BAGRE_EMAIL || 'admin@bagre.local';
const ADMIN_PASSWORD = process.env.BAGRE_PASSWORD || 'admin123';
const VIEWPORT = { width: 1440, height: 900 };

// ----------------------------------------------------------------------------
// Tutorials definitions — cada tutorial é uma sequência de "steps".
// Cada step: { name, action(page), narrative }
//   - action(page) navega/clica/preenche conforme necessário e retorna nada
//   - narrative é o texto markdown que acompanha a screenshot
// ----------------------------------------------------------------------------

const tutorials = {
  quickstart: {
    title: 'Quickstart — primeiro site, primeira subnet, primeiro IP',
    steps: [
      {
        name: '01-login',
        narrative: 'Acesse `http://localhost:3000` e faça login com o e-mail e senha definidos em `.env`.',
        async action(page) {
          await page.goto(`${URL_BASE}/login`);
        },
      },
      {
        name: '02-dashboard',
        narrative: 'O dashboard mostra o resumo: total de sites, subnets, IPs em uso e livres. Atalhos pras operações mais comuns ficam no topo.',
        async action(page) {
          await page.locator('input[type=email]').fill(ADMIN_EMAIL);
          await page.locator('input[type=password]').fill(ADMIN_PASSWORD);
          await page.locator('button:has-text("Entrar")').click();
          await page.waitForURL(`${URL_BASE}/`);
        },
      },
      {
        name: '03-sites',
        narrative: 'Vá em **Sites & Subnets** no menu lateral. Aqui você gerencia a topologia lógica da sua rede.',
        async action(page) {
          await page.goto(`${URL_BASE}/sites`);
        },
      },
      {
        name: '04-cidr-calc',
        narrative: 'A **Calculadora CIDR** ajuda no planejamento antes de criar — verifique se o range escolhido se sobrepõe a algo existente.',
        async action(page) {
          await page.goto(`${URL_BASE}/cidr`);
        },
      },
    ],
  },

  'connect-aws': {
    title: 'Conectar uma conta AWS e ver IPs públicos ociosos',
    steps: [
      {
        name: '01-cloud-accounts-empty',
        narrative: 'Em **Cloud Accounts** (menu admin), você vê o estado das contas cloud conectadas e o relatório FinOps de IPs públicos ociosos.',
        async action(page) {
          await page.goto(`${URL_BASE}/login`);
          await page.locator('input[type=email]').fill(ADMIN_EMAIL);
          await page.locator('input[type=password]').fill(ADMIN_PASSWORD);
          await page.locator('button:has-text("Entrar")').click();
          await page.goto(`${URL_BASE}/admin/cloud-accounts`);
        },
      },
      {
        name: '02-add-account-modal',
        narrative: 'Clique em **Conectar conta**. O modal mostra a policy IAM mínima já formatada — basta copiar e aplicar no console AWS.',
        async action(page) {
          await page.locator('button:has-text("Conectar")').first().click();
          await page.waitForSelector('text=Policy mínima');
        },
      },
    ],
  },

  cidr: {
    title: 'Calculadora CIDR avançada — análise, divisão e busca de free',
    steps: [
      {
        name: '01-parse',
        narrative: 'Na aba **Análise**, cole um CIDR e veja informações básicas + se há overlap com subnets já cadastradas no Bagre.',
        async action(page) {
          await page.goto(`${URL_BASE}/login`);
          await page.locator('input[type=email]').fill(ADMIN_EMAIL);
          await page.locator('input[type=password]').fill(ADMIN_PASSWORD);
          await page.locator('button:has-text("Entrar")').click();
          await page.goto(`${URL_BASE}/cidr`);
        },
      },
      {
        name: '02-split',
        narrative: 'A aba **Dividir** quebra um CIDR em subnets menores marcando quais já estão em uso (vermelho).',
        async action(page) {
          await page.locator('button:has-text("Dividir")').click();
          await page.locator('button:has-text("Dividir")').last().click();
        },
      },
      {
        name: '03-next-free',
        narrative: '**Próximas livres** sugere subnets disponíveis dentro de um parent — ideal pra alocação prática.',
        async action(page) {
          await page.locator('button:has-text("Próximas livres")').click();
        },
      },
    ],
  },
};

// ----------------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------------

async function runTutorial(id, def) {
  const outDir = path.join(REPO_ROOT, 'docs', 'tutorials', id);
  const shotDir = path.join(outDir, 'screenshots');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(shotDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  const mdLines = [`# ${def.title}`, '', '> Gerado automaticamente via `scripts/generate-tutorial-screenshots.mjs`.', ''];

  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];
    process.stdout.write(`  · ${step.name}…`);
    try {
      await step.action(page);
      await page.waitForTimeout(800); // espera UI estabilizar
      const file = `${step.name}.png`;
      await page.screenshot({ path: path.join(shotDir, file) });
      mdLines.push(`## ${i + 1}. ${step.name.replace(/^\d+-/, '').replace(/-/g, ' ')}`);
      mdLines.push('');
      mdLines.push(step.narrative);
      mdLines.push('');
      mdLines.push(`![${step.name}](screenshots/${file})`);
      mdLines.push('');
      process.stdout.write(' ✓\n');
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      mdLines.push(`> ⚠ Step \`${step.name}\` falhou: ${err.message}`);
      mdLines.push('');
    }
  }

  await browser.close();
  await writeFile(path.join(outDir, 'README.md'), mdLines.join('\n'));
  console.log(`  → ${outDir}/README.md (${def.steps.length} steps)`);
}

async function main() {
  const requested = process.argv[2];
  const toRun = requested ? { [requested]: tutorials[requested] } : tutorials;

  if (requested && !tutorials[requested]) {
    console.error(`Tutorial desconhecido: ${requested}`);
    console.error(`Disponíveis: ${Object.keys(tutorials).join(', ')}`);
    process.exit(1);
  }

  for (const [id, def] of Object.entries(toRun)) {
    if (!def) continue;
    console.log(`\n📷 ${id} — ${def.title}`);
    await runTutorial(id, def);
  }

  console.log('\nDone. Veja docs/tutorials/.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
