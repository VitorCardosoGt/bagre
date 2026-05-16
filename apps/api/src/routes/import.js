import { runImport } from '../import.js';

export async function registerImport(app) {
  // Trigger an import using the seed file mounted at /app/seed.json
  app.post('/api/import/seed', async (req, reply) => {
    const token = req.headers['x-admin-token'];
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      reply.code(403);
      return { error: 'invalid admin token' };
    }
    const stats = await runImport('/app/seed.json');
    return stats;
  });
}
