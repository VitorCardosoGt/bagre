<?php
/**
 * Bagre — DokuWiki minimal config
 * Sem ACL, sem login — wiki público (apenas teste local)
 */

$conf['title']        = 'Bagre · Docs';
$conf['lang']         = 'pt-br';
$conf['template']     = 'dokuwiki';
$conf['tagline']      = 'Documentação interna';
$conf['license']      = '';
$conf['license_o']    = '';

// Esconder elementos default do template
$conf['breadcrumbs']  = 0;
$conf['youarehere']   = 0;
$conf['recent']       = 0;
$conf['useheading']   = 1;

// ACL desabilitada — wiki público pra teste
$conf['useacl']       = 0;
$conf['superuser']    = '';

// Cache + segurança razoáveis
$conf['recent_days']  = 7;
$conf['rememberme']   = 0;
$conf['rss_type']     = 'rss2';
