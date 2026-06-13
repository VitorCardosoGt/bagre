import { prisma } from '../db.js';
import { hashPassword, verifyPassword, newToken, requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { rateLimit } from '../rate-limit.js';

const TOKEN_TTL_MIN = 60 * 60 * 8; // 8h

// Proteção contra brute force nos endpoints de auth (por IP, janela de 5min).
// Thresholds generosos pra não atrapalhar uso legítimo nem o login 1-clique da demo.
const loginLimit = rateLimit({ name: 'login', windowMs: 5 * 60_000, max: 50 });
const signupLimit = rateLimit({ name: 'signup', windowMs: 5 * 60_000, max: 20 });
const resetLimit = rateLimit({ name: 'reset', windowMs: 5 * 60_000, max: 20 });

export async function registerAuth(app) {
  app.post('/api/auth/login', { preHandler: loginLimit }, async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      reply.code(400);
      return { error: 'email e password obrigatórios' };
    }
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active) {
      reply.code(401);
      return { error: 'credenciais inválidas' };
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      reply.code(401);
      return { error: 'credenciais inválidas' };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await audit({
      entity: 'user',
      entityId: user.id,
      action: 'login',
      actor: user.email,
    });
    const token = await reply.jwtSign(
      { sub: String(user.id), role: user.role, email: user.email },
      { expiresIn: TOKEN_TTL_MIN },
    );
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePwd: user.mustChangePwd,
      },
    };
  });

  app.post('/api/auth/signup', { preHandler: signupLimit }, async (req, reply) => {
    if (process.env.SIGNUP_ENABLED === 'false') {
      reply.code(403);
      return { error: 'cadastro de novas contas está desativado' };
    }
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      reply.code(400);
      return { error: 'email e password obrigatórios' };
    }
    if (String(password).length < 8) {
      reply.code(400);
      return { error: 'senha precisa ter pelo menos 8 caracteres' };
    }
    const normalized = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      reply.code(400);
      return { error: 'email inválido' };
    }
    const allowed = (process.env.SIGNUP_ALLOWED_DOMAINS || 'bagre.com.br')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const domain = normalized.split('@')[1];
    if (allowed.length && !allowed.includes(domain)) {
      reply.code(400);
      return { error: `email precisa ser de um dos domínios: ${allowed.join(', ')}` };
    }
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      reply.code(409);
      return { error: 'email já cadastrado' };
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: normalized,
        name: name ? String(name).trim() || null : null,
        passwordHash,
        role: 'READER',
        active: true,
        mustChangePwd: false,
        authProvider: 'local',
      },
    });
    await audit({
      entity: 'user',
      entityId: user.id,
      action: 'signup',
      actor: user.email,
    });
    const token = await reply.jwtSign(
      { sub: String(user.id), role: user.role, email: user.email },
      { expiresIn: TOKEN_TTL_MIN },
    );
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePwd: user.mustChangePwd,
      },
    };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    return req.user;
  });

  app.post('/api/auth/change-password', { preHandler: requireAuth }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      reply.code(400);
      return { error: 'nova senha precisa ter pelo menos 8 caracteres' };
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = await verifyPassword(currentPassword || '', user.passwordHash);
    if (!ok) {
      reply.code(401);
      return { error: 'senha atual incorreta' };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePwd: false },
    });
    await audit({
      entity: 'user',
      entityId: user.id,
      action: 'change_password',
      actor: user.email,
    });
    return { ok: true };
  });

  // Self-service reset request: generates a token if user exists. Always
  // returns 200 to avoid user enumeration. The token is logged on the server
  // so the admin can hand it out (no email integration in this MVP).
  app.post('/api/auth/reset-request', { preHandler: resetLimit }, async (req, reply) => {
    const { email } = req.body || {};
    if (!email) {
      reply.code(400);
      return { error: 'email obrigatório' };
    }
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && user.active) {
      const token = newToken();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });
      app.log.warn(
        `password-reset issued for ${user.email} → token=${token} (expires ${expiresAt.toISOString()})`,
      );
    }
    return { ok: true };
  });

  // Apply a reset token to set a new password.
  app.post('/api/auth/reset', async (req, reply) => {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword || newPassword.length < 8) {
      reply.code(400);
      return { error: 'token e nova senha (min 8 chars) obrigatórios' };
    }
    const rec = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!rec || rec.consumedAt || rec.expiresAt < new Date()) {
      reply.code(400);
      return { error: 'token inválido ou expirado' };
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { passwordHash: await hashPassword(newPassword), mustChangePwd: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: rec.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    await audit({
      entity: 'user',
      entityId: rec.userId,
      action: 'reset_password_apply',
      actor: 'self-service',
    });
    return { ok: true };
  });
}
