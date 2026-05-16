import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Power,
  RefreshCw,
  Settings2,
  Clock,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';

function fmtAge(date) {
  if (!date) return 'nunca';
  const ms = Date.now() - new Date(date).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function statusOf(integration) {
  if (!integration.configured) return 'idle';
  if (!integration.enabled) return 'paused';
  if (integration.lastTest?.ok === false) return 'error';
  if (integration.lastSync?.ok === false) return 'error';
  if (integration.enabled && !integration.lastSync && !integration.lastTest) return 'pending';
  return 'ok';
}

const STATUS_BADGE = {
  ok: { label: 'Funcionando', tone: 'emerald', icon: CheckCircle2 },
  error: { label: 'Com erro', tone: 'rose', icon: AlertCircle },
  paused: { label: 'Configurado · pausado', tone: 'amber', icon: AlertTriangle },
  pending: { label: 'Aguardando primeira execução', tone: 'amber', icon: Clock },
  idle: { label: 'Não configurado', tone: 'slate', icon: Settings2 },
};

const TONE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  slate: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const ENTITY_LABELS = {
  zabbix_config: 'Zabbix',
  oidc_config: 'Microsoft Entra',
  user: 'Login',
};
const ACTION_LABELS = {
  sync: 'Sincronizou',
  update: 'Editou config',
  login: 'Login',
};

export default function IntegrationsStatus() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: api.integrationsStatus,
    refetchInterval: 15_000,
  });

  // Live test (per integration) hits the /test endpoint of each provider.
  const testZabbix = useMutation({
    mutationFn: api.testZabbixConfig,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['integrations-status'] });
      r.ok ? toast.success(r.message) : toast.error(r.message);
    },
  });
  const testOidc = useMutation({
    mutationFn: api.testOidcConfig,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['integrations-status'] });
      r.ok ? toast.success(r.message) : toast.error(r.message);
    },
  });

  const overall = data?.overall;
  const integrations = data?.integrations || [];

  // re-render to refresh "há X min"
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <PageHeader
        title="Status das integrações"
        description="Visão consolidada da saúde de cada conector externo. Atualizado a cada 15 segundos."
        actions={
          <button onClick={() => refetch()} className="btn-ghost" disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
        }
      />

      {overall && <OverallBanner overall={overall} integrations={integrations} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {integrations.map((i) => (
          <IntegrationCard
            key={i.key}
            integration={i}
            onTest={() => {
              if (i.key === 'zabbix') testZabbix.mutate();
              else if (i.key === 'oidc') testOidc.mutate();
            }}
            testing={
              (i.key === 'zabbix' && testZabbix.isPending) ||
              (i.key === 'oidc' && testOidc.isPending)
            }
          />
        ))}
      </div>

      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Activity size={14} className="text-slate-400" />
          <h3 className="font-semibold text-sm">Eventos recentes</h3>
        </header>
        {!data?.events?.length ? (
          <p className="p-6 text-sm text-slate-500 text-center">
            Nenhum evento registrado ainda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.events.map((e) => (
              <li key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-xs text-slate-400 w-20">{fmtAge(e.createdAt)}</span>
                <span className="text-xs font-mono text-slate-500">
                  {e.actor || 'sistema'}
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-slate-700 dark:text-slate-300 text-sm">
                  <strong>{ACTION_LABELS[e.action] || e.action}</strong>{' '}
                  {ENTITY_LABELS[e.entity] || e.entity}
                </span>
                {e.after?.updated !== undefined && (
                  <span className="text-xs text-slate-500 ml-auto">
                    {e.after.updated} IPs · {e.after.ghosts?.length || 0} fantasmas
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OverallBanner({ overall, integrations }) {
  const tones = {
    ok: { cls: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800', icon: CheckCircle2, iconCls: 'text-emerald-500' },
    warn: { cls: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800', icon: AlertTriangle, iconCls: 'text-amber-500' },
    error: { cls: 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800', icon: AlertCircle, iconCls: 'text-rose-500' },
    idle: { cls: 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700', icon: Settings2, iconCls: 'text-slate-400' },
  };
  const t = tones[overall.tone] || tones.idle;
  const Icon = t.icon;
  const active = integrations.filter((i) => i.enabled && i.configured).length;
  const errors = integrations.filter((i) => i.lastTest?.ok === false || i.lastSync?.ok === false).length;

  return (
    <div className={`card p-5 mb-6 border ${t.cls} flex items-center gap-4`}>
      <Icon size={28} className={t.iconCls} />
      <div className="flex-1">
        <div className="font-semibold">{overall.label}</div>
        <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          {active} de {integrations.length} integrações ativas
          {errors > 0 && <> · <span className="text-rose-600">{errors} com erro</span></>}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ integration, onTest, testing }) {
  const status = statusOf(integration);
  const badge = STATUS_BADGE[status];
  const BadgeIcon = badge.icon;

  return (
    <article className="card p-5 flex flex-col gap-3">
      <header className="flex items-start gap-3">
        <div className="text-2xl leading-none">{integration.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">{integration.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{integration.description}</p>
        </div>
        <span className={`badge inline-flex items-center gap-1.5 px-2.5 py-1 ${TONE_CLASSES[badge.tone]}`}>
          <BadgeIcon size={12} />
          {badge.label}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-slate-100 dark:border-slate-800 pt-3">
        {integration.lastTest && (
          <>
            <dt className="text-xs text-slate-400 uppercase tracking-wider">Último teste</dt>
            <dd className="text-right">
              <span className={integration.lastTest.ok ? 'text-emerald-600' : 'text-rose-600'}>
                {integration.lastTest.ok ? '✓' : '✗'}
              </span>{' '}
              <span className="text-xs">{fmtAge(integration.lastTest.at)}</span>
            </dd>
          </>
        )}
        {integration.lastSync && (
          <>
            <dt className="text-xs text-slate-400 uppercase tracking-wider">Última sync</dt>
            <dd className="text-right">
              <span className={integration.lastSync.ok ? 'text-emerald-600' : 'text-rose-600'}>
                {integration.lastSync.ok ? '✓' : '✗'}
              </span>{' '}
              <span className="text-xs">{fmtAge(integration.lastSync.at)}</span>
              {integration.intervalMinutes && (
                <span className="block text-[10px] text-slate-400">
                  intervalo {integration.intervalMinutes} min
                </span>
              )}
            </dd>
          </>
        )}
        {integration.lastSync?.stats && (
          <>
            <dt className="text-xs text-slate-400 uppercase tracking-wider">Última leitura</dt>
            <dd className="text-right text-xs font-mono">
              {integration.lastSync.stats.hosts ?? 0} hosts ·{' '}
              {integration.lastSync.stats.updated ?? 0} upd ·{' '}
              {(integration.lastSync.stats.ghosts || []).length} 👻
            </dd>
          </>
        )}
        {integration.ipsTouched > 0 && (
          <>
            <dt className="text-xs text-slate-400 uppercase tracking-wider">IPs alimentados</dt>
            <dd className="text-right text-sm font-medium">{integration.ipsTouched}</dd>
          </>
        )}
      </dl>

      {(integration.lastTest?.ok === false || integration.lastSync?.ok === false) && (
        <div className="text-xs bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 p-2 rounded-md border border-rose-200 dark:border-rose-800">
          {integration.lastTest?.message || integration.lastSync?.message}
        </div>
      )}

      <footer className="flex items-center gap-2 mt-auto pt-2">
        {integration.configured && (
          <button onClick={onTest} disabled={testing} className="btn-ghost">
            <Activity size={13} className={testing ? 'animate-pulse' : ''} />
            {testing ? 'Testando…' : 'Testar agora'}
          </button>
        )}
        <Link to={integration.configUrl} className="btn-ghost ml-auto">
          <Settings2 size={13} />
          {integration.configured ? 'Configurar' : 'Conectar'}
          <ExternalLink size={11} />
        </Link>
      </footer>
    </article>
  );
}

