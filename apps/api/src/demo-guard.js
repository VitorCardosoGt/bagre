// Guardas do ambiente de demonstração (DEMO_MODE).
//
// Quando DEMO_MODE=true a instância é pública e compartilhada. Precisamos:
//  - impedir que um visitante repointe integrações para alvos arbitrários
//    (risco de SSRF / scan, ex.: endpoint de metadata 169.254.169.254);
//  - bloquear ações destrutivas que estragariam a demo para os próximos.
//
// O fluxo-bandeira (aprovar pending discoveries) permanece LIBERADO.

export const DEMO = process.env.DEMO_MODE === 'true';

/** Resposta padrão para ações bloqueadas na demo. */
export function demoBlock(reply, msg) {
  reply.code(403);
  return {
    error: 'demo_mode_readonly',
    detail: msg || 'Ação desabilitada no ambiente de demonstração.',
  };
}

/** Remove campos "fixados" de um objeto de update quando em DEMO_MODE. */
export function stripDemoPinned(data, fields) {
  if (!DEMO) return data;
  for (const f of fields) delete data[f];
  return data;
}
