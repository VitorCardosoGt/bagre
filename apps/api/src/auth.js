import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from './db.js';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Bootstrap a default admin user if no users exist yet.
 *
 * Security:
 * - Se BOOTSTRAP_ADMIN_PASSWORD não vier do env, geramos uma senha aleatória
 *   forte e logamos UMA vez. Evita o anti-pattern "admin/admin123" em
 *   deploys que esquecem de configurar.
 * - mustChangePwd=true força troca no primeiro login independentemente.
 * - Se BOOTSTRAP_ADMIN_PASSWORD vier mas for muito curta (<10 chars), recusa
 *   criar o usuário — fail-closed.
 */
export async function ensureBootstrapAdmin(log) {
  const count = await prisma.user.count();
  if (count > 0) return;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bagre.local';
  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  } else if (password.length < 10) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD precisa ter pelo menos 10 caracteres. Recusa fail-closed.',
    );
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name: 'Administrator',
      passwordHash,
      role: 'ADMIN',
      mustChangePwd: true,
    },
  });
  if (generated) {
    log.warn(`╔═══════════════════════════════════════════════════════════════════╗`);
    log.warn(`║  BOOTSTRAP ADMIN CRIADO (senha gerada porque BOOTSTRAP_ADMIN_PASSWORD não foi definida)`);
    log.warn(`║  email:    ${email}`);
    log.warn(`║  password: ${password}`);
    log.warn(`║  Anote essa senha — não será exibida de novo. mustChangePwd=true.`);
    log.warn(`╚═══════════════════════════════════════════════════════════════════╝`);
  } else {
    log.info(`Bootstrap admin criado: ${email} (mustChangePwd=true)`);
  }
}

/**
 * Per-route guards. The global onRequest hook in index.js already verifies the
 * JWT and attaches the full user to req.user. These just check the role.
 */
export async function requireAuth(req, reply) {
  if (!req.user) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
}

export async function requireAdmin(req, reply) {
  if (!req.user) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  if (req.user.role !== 'ADMIN') {
    reply.code(403).send({ error: 'forbidden — requer perfil ADMIN' });
    return reply;
  }
}
