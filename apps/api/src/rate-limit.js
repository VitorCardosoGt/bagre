// Limitador de taxa em memória, por processo. Protege endpoints sensíveis
// (login, signup, reset) contra brute force numa instância única — caso de uso
// de self-host e do ambiente de demonstração. Não substitui um limitador
// distribuído em deploys multi-réplica (aí use @fastify/rate-limit + store).
//
// IMPORTANTE: depende de `trustProxy` no Fastify para que `req.ip` reflita o
// cliente real (X-Forwarded-For) quando atrás de um reverse proxy/nginx.

const buckets = new Map(); // `${name}:${ip}` -> { count, resetAt }

// Limpeza preguiçosa pra não vazar memória com IPs que não voltam.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 5 * 60_000);
sweeper.unref?.();

/**
 * Cria um preHandler de rate limit (janela fixa).
 * @param {object} opts
 * @param {string} opts.name  rótulo do bucket (separa contadores por rota)
 * @param {number} opts.windowMs  tamanho da janela em ms
 * @param {number} opts.max  máximo de requisições por janela por IP
 */
export function rateLimit({ name = 'default', windowMs = 60_000, max = 60 } = {}) {
  return async function rateLimitPreHandler(req, reply) {
    const now = Date.now();
    const id = `${name}:${req.ip || 'unknown'}`;
    let b = buckets.get(id);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(id, b);
    }
    b.count += 1;
    if (b.count > max) {
      reply.header('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      reply.code(429).send({ error: 'muitas tentativas — tente novamente em instantes' });
      return reply;
    }
  };
}
