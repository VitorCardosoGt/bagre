/* Bagre — DokuWiki userscript
 * - Carrega Inter + JetBrains Mono via <link> no head (LESS quebra com @import)
 * - Adiciona dark mode toggle no header (persiste em localStorage)
 * - Adiciona hamburger menu pra mobile
 * - Faz cleanup de imagens default do DokuWiki
 */
(function () {
  'use strict';

  // ---------- Fonts (inject no <head>) ----------
  var fontHref = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap';
  if (!document.querySelector('link[href*="fonts.googleapis"][href*="Inter"]')) {
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(pre1);

    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = 'anonymous';
    document.head.appendChild(pre2);

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontHref;
    document.head.appendChild(link);
  }

  // ---------- Theme: aplicar antes do paint pra evitar flash ----------
  var THEME_KEY = 'ipam.wiki.theme';
  function applyTheme(t) {
    if (t === 'dark') document.body.classList.add('ipam-theme-dark');
    else document.body.classList.remove('ipam-theme-dark');
  }
  // tenta aplicar imediato (body pode não existir ainda)
  var stored = localStorage.getItem(THEME_KEY);
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var current = stored || (prefersDark ? 'dark' : 'light');
  if (document.body) applyTheme(current);

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // SVG icons
  var SUN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  var MENU_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>';

  ready(function () {
    // Reaplica theme com body já existente
    applyTheme(current);

    var header = document.querySelector('#dokuwiki__header > div.pad') || document.querySelector('#dokuwiki__header');

    // ---------- Theme toggle ----------
    if (header && !document.querySelector('.ipam-theme-toggle')) {
      var themeBtn = document.createElement('button');
      themeBtn.className = 'ipam-theme-toggle';
      themeBtn.type = 'button';
      themeBtn.setAttribute('aria-label', 'Alternar tema');
      themeBtn.setAttribute('title', 'Alternar tema claro/escuro');

      function updateIcon() {
        themeBtn.innerHTML = document.body.classList.contains('ipam-theme-dark') ? SUN_SVG : MOON_SVG;
      }
      updateIcon();

      themeBtn.addEventListener('click', function () {
        var isDark = document.body.classList.toggle('ipam-theme-dark');
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
        updateIcon();
      });

      header.appendChild(themeBtn);
    }

    // ---------- Hamburger menu (mobile) ----------
    if (header && !document.querySelector('.ipam-menu-toggle')) {
      var menuBtn = document.createElement('button');
      menuBtn.className = 'ipam-menu-toggle';
      menuBtn.type = 'button';
      menuBtn.setAttribute('aria-label', 'Abrir menu');
      menuBtn.innerHTML = MENU_SVG;
      menuBtn.addEventListener('click', function () {
        document.body.classList.toggle('ipam-menu-open');
      });
      header.insertBefore(menuBtn, header.firstChild);
    }

    // Fechar drawer ao clicar fora ou em link
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('ipam-menu-open')) return;
      var aside = document.getElementById('dokuwiki__aside');
      var toggle = document.querySelector('.ipam-menu-toggle');
      if (aside && aside.contains(e.target)) {
        if (e.target.tagName === 'A') document.body.classList.remove('ipam-menu-open');
        return;
      }
      if (toggle && toggle.contains(e.target)) return;
      document.body.classList.remove('ipam-menu-open');
    });

    // ---------- Cleanup imagens default do DokuWiki ----------
    var orphanSelectors = [
      '#dokuwiki__header img[src*="logo"]',
      '#dokuwiki__header img[src*="dokuwiki"]',
      '#dokuwiki__header .headings img',
      '#dokuwiki__footer img',
      '.licenseinfo img',
      'img.media[src*="dokuwiki:logo"]',
      'a[href*="dokuwiki.org"] img'
    ];
    orphanSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });

    var badSelectors = [
      'a[href*="dokuwiki.org"][title*="DokuWiki"]',
      '.dokuwiki__powered',
      '#dokuwiki__powered',
      '.licenseinfo'
    ];
    badSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });
  });
})();
