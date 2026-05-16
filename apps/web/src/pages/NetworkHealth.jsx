import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Ghost,
  RefreshCw,
  Database,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

function fmtAge(date) {
  if (!date) return 'nunca';
  const d = new Date(date);
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `há ${days}d`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `há ${hours}h`;
  return 'agora há pouco';
}

export default function NetworkHealth() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['network-health'],
    queryFn: api.networkHealth,
  });

  return (
    <div>
      <PageHeader
        title="Saúde da rede"
        description="Inconsistências detectadas pelo cruzamento entre IPAM e fontes externas (Zabbix, scanners). Mantém o cadastro fiel à realidade."
        actions={
          <button onClick={() => refetch()} className="btn-ghost" disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card
          icon={<AlertTriangle size={18} />}
          tone="amber"
          title="IPs stale"
          count={data?.stale?.length}
          hint={`Marcado em uso mas sem ser visto há ${data?.staleAfterDays ?? '—'} dias`}
        />
        <Card
          icon={<Ghost size={18} />}
          tone="rose"
          title="Conflitos"
          count={data?.conflicts?.length}
          hint="Mesmo IP em mais de um lugar / fora do range"
        />
        <Card
          icon={<Database size={18} />}
          tone="brand"
          title="Fontes ativas"
          count={data?.sources?.length}
          hint="Origens que alimentam o IPAM"
        />
      </div>

      {data?.sources?.length > 0 && (
        <section className="card p-4 mb-6">
          <h3 className="text-sm font-medium text-slate-600 mb-3">Fontes de descoberta</h3>
          <div className="flex gap-2 flex-wrap">
            {data.sources.map((s) => (
              <span
                key={s.source}
                className="badge bg-brand-50 text-brand-700 ring-brand-200/60 dark:bg-brand-900/30 dark:text-brand-300"
              >
                <Activity size={11} /> {s.source} · {s.count} IPs
              </span>
            ))}
          </div>
        </section>
      )}

      <Section
        title="IPs stale"
        subtitle={`Marcados como em uso mas sem responder há ${data?.staleAfterDays ?? '—'} dias ou mais.`}
        empty="Tudo em ordem — nenhum IP stale detectado."
        items={data?.stale}
        renderRow={(ip) => (
          <>
            <td className="px-3 py-2 font-mono text-xs">{ip.address}</td>
            <td className="px-3 py-2 text-sm">{ip.hostname || '—'}</td>
            <td className="px-3 py-2 text-xs text-slate-500">
              {ip.site} / {ip.subnet}
            </td>
            <td className="px-3 py-2 text-xs">
              <span className="text-amber-600">
                {ip.lastSeenAt ? fmtAge(ip.lastSeenAt) : 'nunca visto por scanner'}
              </span>
              {ip.lastSeenSource && (
                <span className="text-slate-400 ml-1">· {ip.lastSeenSource}</span>
              )}
            </td>
            <td className="px-3 py-2 text-right">
              <Link
                to={`/subnets/${ip.subnetId}?ip=${ip.address}`}
                className="text-brand-600 hover:underline inline-flex items-center gap-1 text-xs"
              >
                <ExternalLink size={12} /> abrir
              </Link>
            </td>
          </>
        )}
        cols={['IP', 'Hostname', 'Localização', 'Última vez visto', '']}
        loading={isLoading}
      />

      <Section
        title="Conflitos"
        subtitle="IPs marcados com status CONFLICT (validação automática)."
        empty="Nenhum conflito ativo."
        items={data?.conflicts}
        renderRow={(ip) => (
          <>
            <td className="px-3 py-2 font-mono text-xs">{ip.address}</td>
            <td className="px-3 py-2 text-sm">{ip.hostname || '—'}</td>
            <td className="px-3 py-2 text-xs text-slate-500">
              {ip.site} / {ip.subnet}
            </td>
            <td className="px-3 py-2 text-right">
              <Link
                to={`/subnets/${ip.subnetId}?ip=${ip.address}`}
                className="text-brand-600 hover:underline inline-flex items-center gap-1 text-xs"
              >
                <ExternalLink size={12} /> abrir
              </Link>
            </td>
          </>
        )}
        cols={['IP', 'Hostname', 'Localização', '']}
        loading={isLoading}
      />
    </div>
  );
}

function Card({ icon, tone, title, count, hint }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    brand: 'bg-brand-50 text-brand-700',
  };
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{count ?? '—'}</div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, empty, items, renderRow, cols, loading }) {
  return (
    <section className="card overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {loading ? (
        <p className="p-6 text-sm text-slate-500">Carregando…</p>
      ) : !items?.length ? (
        <p className="p-8 text-sm text-slate-500 text-center">{empty}</p>
      ) : (
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              {cols.map((c, i) => (
                <th key={i} className="px-3 py-2 text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((ip) => (
              <tr key={ip.id}>{renderRow(ip)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
