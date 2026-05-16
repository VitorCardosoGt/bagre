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
 * Reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD from env.
 */
export async function ensureBootstrapAdmin(log) {
  const count = await prisma.user.count();
  if (count > 0) return;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bagre.local';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
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
  log.warn(`bootstrap admin created: ${email} / ${password}  (mustChangePwd=true)`);
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
