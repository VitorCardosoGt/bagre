#!/usr/bin/env node
// Gera um HTML único e dinâmico com toda a documentação embedada.
// Saída: ./docs.html
//
// Uso: node scripts/build-docs-html.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'docs.html');

const FILES = [
  { id: 'readme',          file: 'README.md',                title: 'Visão geral',       icon: '📖' },
  { id: 'arquitetura',     file: '01-arquitetura.md',        title: 'Arquitetura',       icon: '🏛️' },
  { id: 'instalacao',      file: '02-instalacao.md',         title: 'Instalação',        icon: '🚀' },
  { id: 'uso-diario',      file: '03-uso-diario.md',         title: 'Uso diário',        icon: '🖥️' },
  { id: 'administracao',   file: '04-administracao.md',      title: 'Administração',     icon: '🛠️' },
  { id: 'integracoes',     file: '05-integracoes.md',        title: 'Integrações',       icon: '🔌' },
  { id: 'api-rest',        file: '06-api-rest.md',           title: 'API REST',          icon: '⚙️' },
  { id: 'operacao',        file: '07-operacao.md',           title: 'Operação',          icon: '🩺' },
  { id: 'desenvolvimento', file: '08-desenvolvimento.md',    title: 'Desenvolvimento',   icon: '👨‍💻' },
];

// Carrega todos os arquivos
const docs = [];
const projectReadme = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
docs.push({ id: 'readme-root', title: 'README do projeto', icon: '⭐', content: projectReadme });
for (const f of FILES) {
  const fp = f.id === 'readme' ? path.join(DOCS, 'README.md') : path.join(DOCS, f.file);
  if (f.id === 'readme') continue; // já tem o do projeto
  const content = await fs.readFile(fp, 'utf8');
  docs.push({ id: f.id, title: f.title, icon: f.icon, content });
}
// Adicionar índice da pasta docs/ depois do README do projeto
const docsIndex = await fs.readFile(path.join(DOCS, 'README.md'), 'utf8');
docs.splice(1, 0, { id: 'docs-index', title: 'Índice da documentação', icon: '📚', content: docsIndex });

// Escapa para JSON em script tag
const json = JSON.stringify(docs).replace(/<\/script>/g, '<\\/script>');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Documentação · Bagre</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css" />
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
<style>
:root{
  --brand-50:#eef4ff;--brand-100:#dbe6fe;--brand-200:#bdd2fe;--brand-500:#4865f4;--brand-600:#3346e8;--brand-700:#2a37cf;
  --slate-50:#f8fafc;--slate-100:#f1f5f9;--slate-200:#e2e8f0;--slate-300:#cbd5e1;--slate-400:#94a3b8;
  --slate-500:#64748b;--slate-600:#475569;--slate-700:#334155;--slate-800:#1e293b;--slate-900:#0f172a;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body,#app{height:100%}
body{
  font-family:'Inter',system-ui,-apple-system,sans-serif;
  font-feature-settings:'cv02','cv03','cv04','cv11';
  color:var(--slate-900);
  background:var(--slate-50);
  -webkit-font-smoothing:antialiased;
}
code,.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
::selection{background:var(--brand-100);color:var(--brand-900)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(203,213,225,.7);border-radius:9999px;border:2px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background-color:#94a3b8}

#app{display:flex;min-height:100vh}

/* Sidebar */
aside{
  width:280px;flex-shrink:0;
  background:#fff;border-right:1px solid var(--slate-100);
  display:flex;flex-direction:column;
  position:sticky;top:0;height:100vh;overflow-y:auto;
}
aside .brand{padding:22px 22px 14px;display:flex;align-items:center;gap:12px}
aside .brand .logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4865f4,#7e3ff2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;box-shadow:0 8px 24px -8px rgba(72,101,244,.5)}
aside .brand .text{line-height:1.1}
aside .brand .text .t1{font-size:15px;font-weight:600}
aside .brand .text .t1 b{color:var(--brand-600)}
aside .brand .text .t2{font-size:10px;color:var(--slate-400);text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
aside .search{padding:0 16px 14px}
aside .search input{
  width:100%;border:1px solid var(--slate-200);border-radius:10px;
  padding:8px 12px 8px 32px;font-size:13px;background:#fff
  url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%2394a3b8" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z"/></svg>')
  no-repeat 10px center;background-size:14px;
  outline:none;transition:border-color .15s,box-shadow .15s;
}
aside .search input:focus{border-color:var(--brand-500);box-shadow:0 0 0 3px rgba(72,101,244,.15)}
aside nav{flex:1;padding:0 12px 12px;overflow-y:auto}
aside nav a{
  display:flex;align-items:center;gap:10px;
  padding:8px 12px;margin-bottom:2px;border-radius:8px;
  text-decoration:none;color:var(--slate-600);font-size:13px;font-weight:500;
  transition:background .15s,color .15s;
}
aside nav a:hover{background:var(--slate-50);color:var(--slate-900)}
aside nav a.active{background:var(--brand-50);color:var(--brand-700)}
aside nav a .ic{font-size:14px;flex-shrink:0;width:18px;text-align:center}
aside nav a .num{margin-left:auto;font-size:10px;color:var(--slate-400);font-family:'JetBrains Mono'}
aside .credit{padding:14px 22px;border-top:1px solid var(--slate-100);font-size:11px;color:var(--slate-400);line-height:1.6}
aside .credit b{color:var(--slate-600)}

/* Conteúdo */
main{flex:1;min-width:0;display:flex}
.page-wrap{flex:1;min-width:0;max-width:920px;margin:0 auto;padding:48px 56px 80px;width:100%}
.toc{
  width:240px;flex-shrink:0;padding:48px 32px 80px;
  position:sticky;top:0;align-self:flex-start;max-height:100vh;overflow-y:auto;
  display:none;
}
@media(min-width:1280px){ .toc{display:block} }
.toc h4{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--slate-400);margin-bottom:10px}
.toc a{display:block;padding:5px 8px;border-radius:6px;color:var(--slate-500);text-decoration:none;font-size:12.5px;line-height:1.5;border-left:2px solid transparent;margin-left:-2px;transition:all .15s}
.toc a:hover{color:var(--slate-900);background:var(--slate-50)}
.toc a.active{color:var(--brand-700);border-left-color:var(--brand-500);background:var(--brand-50)}
.toc a.h3{padding-left:20px;font-size:11.5px}

/* Estilos do conteúdo (markdown) */
.content h1,.content h2,.content h3,.content h4,.content h5{font-weight:600;letter-spacing:-.01em;line-height:1.3;color:var(--slate-900);scroll-margin-top:32px}
.content h1{font-size:32px;margin-bottom:8px;padding-bottom:14px;border-bottom:1px solid var(--slate-100)}
.content h2{font-size:22px;margin:40px 0 14px}
.content h3{font-size:17px;margin:28px 0 10px}
.content h4{font-size:14px;margin:18px 0 6px;color:var(--slate-700)}
.content p{font-size:15px;line-height:1.7;color:var(--slate-700);margin-bottom:14px}
.content blockquote{border-left:3px solid var(--brand-300,#90b3fd);background:var(--brand-50);padding:10px 16px;border-radius:0 8px 8px 0;margin:16px 0;color:var(--slate-700);font-size:14px}
.content blockquote p{margin-bottom:0}
.content ul,.content ol{padding-left:22px;margin-bottom:14px;color:var(--slate-700)}
.content li{font-size:15px;line-height:1.7;margin-bottom:4px}
.content li::marker{color:var(--slate-400)}
.content a{color:var(--brand-600);text-decoration:none;border-bottom:1px solid rgba(72,101,244,.2);transition:border-color .15s}
.content a:hover{border-bottom-color:var(--brand-600)}
.content code{font-size:13px;background:var(--slate-100);color:var(--slate-800);padding:2px 6px;border-radius:5px;font-family:'JetBrains Mono'}
.content pre{
  background:#0f172a;color:#e2e8f0;padding:16px 18px;border-radius:12px;
  margin:16px 0;overflow-x:auto;font-size:13px;line-height:1.6;
  border:1px solid #1e293b;
}
.content pre code{background:transparent;color:inherit;padding:0;border-radius:0}
.content table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13.5px;background:#fff;border-radius:10px;overflow:hidden;border:1px solid var(--slate-100)}
.content th{background:var(--slate-50);padding:9px 14px;text-align:left;font-weight:600;color:var(--slate-600);border-bottom:1px solid var(--slate-100);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.content td{padding:9px 14px;border-bottom:1px solid var(--slate-100);color:var(--slate-700)}
.content tr:last-child td{border-bottom:0}
.content tr:nth-child(even){background:rgba(248,250,252,.5)}
.content hr{border:0;border-top:1px solid var(--slate-100);margin:32px 0}
.content strong{color:var(--slate-900);font-weight:600}
.content img{max-width:100%;border-radius:8px;margin:14px 0}
.content kbd{background:#fff;border:1px solid var(--slate-200);border-bottom-width:2px;border-radius:5px;padding:1px 6px;font-size:11px;font-family:'JetBrains Mono';color:var(--slate-700)}

.title-meta{display:flex;align-items:center;gap:10px;margin-bottom:14px;color:var(--slate-400);font-size:13px}
.title-meta .badge{padding:2px 10px;border-radius:9999px;background:var(--brand-50);color:var(--brand-700);font-weight:500;font-size:11.5px}

/* Page transitions */
@keyframes fade-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.page-wrap{animation:fade-in .25s ease-out both}
</style>
</head>
<body>
<div id="app">
<aside>
  <div class="brand">
    <div class="logo">B</div>
    <div class="text">
      <div class="t1">Bagre</div>
      <div class="t2">Documentação · IPAM</div>
    </div>
  </div>
  <div class="search">
    <input id="search" placeholder="Buscar na documentação…" />
  </div>
  <nav id="nav"></nav>
  <div class="credit">
    Sistema desenvolvido por<br />
    <b>Fabricio Cruz</b>
  </div>
</aside>

<main>
  <div class="page-wrap">
    <article class="content" id="content">Carregando…</article>
  </div>
  <aside class="toc" id="toc"></aside>
</main>
</div>

<script>
const DOCS = ${json};

// Configura marked
marked.setOptions({
  breaks: false,
  gfm: true,
  headerIds: true,
});

const SECTIONS = [
  { id: 'readme-root',     title: 'README do projeto',    icon: '⭐' },
  { id: 'docs-index',      title: 'Índice da documentação', icon: '📚' },
  { id: 'arquitetura',     title: 'Arquitetura',          icon: '🏛️' },
  { id: 'instalacao',      title: 'Instalação',           icon: '🚀' },
  { id: 'uso-diario',      title: 'Uso diário',           icon: '🖥️' },
  { id: 'administracao',   title: 'Administração',        icon: '🛠️' },
  { id: 'integracoes',     title: 'Integrações',          icon: '🔌' },
  { id: 'api-rest',        title: 'API REST',             icon: '⚙️' },
  { id: 'operacao',        title: 'Operação',             icon: '🩺' },
  { id: 'desenvolvimento', title: 'Desenvolvimento',      icon: '👨‍💻' },
];

const docMap = Object.fromEntries(DOCS.map(d => [d.id, d]));

function render(id) {
  const doc = docMap[id];
  if (!doc) return;
  // Marca ativo na sidebar
  document.querySelectorAll('aside nav a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  // Renderiza markdown
  const html = marked.parse(doc.content);
  document.getElementById('content').innerHTML = html;
  // Highlight code
  if (window.Prism && Prism.highlightAll) Prism.highlightAll();
  // Sobe pro topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Atualiza hash
  history.replaceState(null, '', '#' + id);
  // Build TOC
  buildToc();
  // Atualiza título
  document.title = doc.title ? doc.title + ' · Bagre' : 'Documentação · Bagre';
}

function buildToc() {
  const toc = document.getElementById('toc');
  const headings = document.querySelectorAll('.content h2, .content h3');
  if (!headings.length) { toc.innerHTML = ''; return; }
  let html = '<h4>Nesta página</h4>';
  headings.forEach(h => {
    const id = h.id || h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    h.id = id;
    const tag = h.tagName.toLowerCase();
    html += '<a href="#' + id + '" class="' + (tag === 'h3' ? 'h3' : '') + '">' + h.textContent + '</a>';
  });
  toc.innerHTML = html;

  // Scroll spy
  const links = toc.querySelectorAll('a');
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
      }
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  headings.forEach(h => obs.observe(h));
}

function filterNav(term) {
  const t = (term || '').toLowerCase().trim();
  const links = document.querySelectorAll('aside nav a');
  links.forEach(link => {
    const id = link.dataset.id;
    const doc = docMap[id];
    if (!t) {
      link.style.display = '';
      link.querySelector('.num').textContent = '';
      return;
    }
    const inTitle = doc.title.toLowerCase().includes(t);
    const matches = (doc.content.toLowerCase().match(new RegExp(t.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g')) || []).length;
    link.style.display = (inTitle || matches > 0) ? '' : 'none';
    link.querySelector('.num').textContent = matches > 0 && !inTitle ? '· ' + matches : '';
  });
}

// Build sidebar
const navEl = document.getElementById('nav');
SECTIONS.forEach(s => {
  const a = document.createElement('a');
  a.href = '#' + s.id;
  a.dataset.id = s.id;
  a.innerHTML = '<span class="ic">' + s.icon + '</span><span>' + s.title + '</span><span class="num"></span>';
  a.onclick = (e) => { e.preventDefault(); render(s.id); };
  navEl.appendChild(a);
});

document.getElementById('search').oninput = (e) => filterNav(e.target.value);

// Init
const initial = location.hash.replace('#', '') || 'readme-root';
render(docMap[initial] ? initial : 'readme-root');

// Suporte ao clique em links internos (ex: [foo](./05-integracoes.md))
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  // Mapeia caminhos de doc local para IDs
  const m = href.match(/(?:\\.\\/)?(\\d{2}-[a-z-]+)\\.md(#.*)?/i);
  if (m) {
    e.preventDefault();
    const idMap = {
      '01-arquitetura': 'arquitetura',
      '02-instalacao': 'instalacao',
      '03-uso-diario': 'uso-diario',
      '04-administracao': 'administracao',
      '05-integracoes': 'integracoes',
      '06-api-rest': 'api-rest',
      '07-operacao': 'operacao',
      '08-desenvolvimento': 'desenvolvimento',
    };
    const id = idMap[m[1]];
    if (id) render(id);
    if (m[2]) setTimeout(() => { location.hash = m[2]; }, 100);
  }
});
</script>
</body>
</html>`;

await fs.writeFile(OUT, html);
const stat = await fs.stat(OUT);
console.log(`✓ ${OUT}`);
console.log(`  ${(stat.size / 1024).toFixed(1)} KB · ${docs.length} seções`);
