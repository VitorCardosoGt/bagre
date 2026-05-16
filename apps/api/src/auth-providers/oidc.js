// OIDC provider using `openid-client`. Configuration lives in the DB (OidcConfig)
// so admins can enable/disable SSO from the UI without redeploying.

import { Issuer, generators } from 'openid-client';
import { prisma } from '../db.js';

let cachedIssuer = null;
let cachedIssuerUrl = null;
let cachedClient = null;
let cachedConfigSig = null;

export async function getConfig() {
  let cfg = await prisma.oidcConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    cfg = await prisma.oidcConfig.create({ data: { id: 1 } });
  }
  return cfg;
}

export function isConfigured(cfg) {
  return Boolean(cfg?.issuerUrl && cfg?.clientId && cfg?.clientSecret && cfg?.redirectUri);
}

function configSig(cfg) {
  return [cfg.issuerUrl, cfg.clientId, cfg.clientSecret, cfg.redirectUri].join('|');
}

async function getClient(cfg) {
  if (!isConfigured(cfg)) {
    throw new Error('OIDC não está configurado completamente');
  }
  const sig = configSig(cfg);
  if (cachedClient && cachedConfigSig === sig) return cachedClient;
  if (!cachedIssuer || cachedIssuerUrl !== cfg.issuerUrl) {
    cachedIssuer = await Issuer.discover(cfg.issuerUrl);
    cachedIssuerUrl = cfg.issuerUrl;
  }
  cachedClient = new cachedIssuer.Client({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uris: [cfg.redirectUri],
    response_types: ['code'],
  });
  cachedConfigSig = sig;
  return cachedClient;
}

/** Test discovery — used by the admin "Testar conexão" button. */
export async function testDiscovery(cfg) {
  if (!cfg?.issuerUrl) {
    return { ok: false, message: 'Issuer URL ausente' };
  }
  try {
    const issuer = await Issuer.discover(cfg.issuerUrl);
    return {
      ok: true,
      message: `OK — issuer ${issuer.metadata.issuer}`,
      issuer: issuer.metadata.issuer,
      endpoints: {
        authorization: issuer.metadata.authorization_endpoint,
        token: issuer.metadata.token_endpoint,
        userinfo: issuer.metadata.userinfo_endpoint,
      },
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** Build the authorization URL + state/nonce/PKCE values. */
export async function buildAuthRequest(next = '/') {
  const cfg = await getConfig();
  const client = await getClient(cfg);
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const url = client.authorizationUrl({
    scope: cfg.scopes || 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return {
    url,
    flow: { state, nonce, codeVerifier, next },
  };
}

/** Handle callback: validate, exchange code, fetch userinfo, return claims. */
export async function handleCallback(req, flow) {
  const cfg = await getConfig();
  const client = await getClient(cfg);
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(cfg.redirectUri, params, {
    state: flow.state,
    nonce: flow.nonce,
    code_verifier: flow.codeVerifier,
  });
  const claims = tokenSet.claims();
  let userinfo = {};
  try {
    userinfo = await client.userinfo(tokenSet.access_token);
  } catch {
    // some IdPs don't expose userinfo or it's blocked; fall back to ID token claims
  }
  return { claims, userinfo, tokenSet };
}

export function pickClaims(cfg, claims, userinfo) {
  const merged = { ...claims, ...userinfo };
  const email =
    merged[cfg.emailClaim] ||
    merged.email ||
    merged.preferred_username ||
    merged.upn ||
    null;
  const name = merged[cfg.nameClaim] || merged.name || null;
  const sub = merged.sub || merged.oid || null;
  let groups = merged[cfg.groupsClaim] || merged.groups || [];
  if (typeof groups === 'string') groups = [groups];
  if (!Array.isArray(groups)) groups = [];
  return { email, name, sub, groups };
}

/** Map external groups to ADMIN/READER. */
export function mapRole(cfg, externalGroups) {
  const adminGroups = (cfg.adminGroups || []).map((g) => String(g).trim()).filter(Boolean);
  if (!adminGroups.length) return cfg.defaultRole || 'READER';
  const set = new Set(externalGroups.map((g) => String(g)));
  for (const g of adminGroups) if (set.has(g)) return 'ADMIN';
  return cfg.defaultRole || 'READER';
}

/** Reset cached client; called when admin saves new settings. */
export function invalidateClientCache() {
  cachedIssuer = null;
  cachedIssuerUrl = null;
  cachedClient = null;
  cachedConfigSig = null;
}
