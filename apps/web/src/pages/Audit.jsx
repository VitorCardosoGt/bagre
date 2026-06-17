import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Filter, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';

const ENTITY_LABELS = {
  ip: 'IP',
  site: 'Site',
  subnet: 'Subnet',
  user: 'Usuário',
  datacenter_vlan: 'VLAN DC',
  cloud_account: 'Cloud account',
  zabbix_config: 'Zabbix',
  prometheus_config: 'Prometheus',
  oidc_config: 'Microsoft Entra',
};
const ACTION_LABELS = {
  create: 'Criou',
  update: 'Editou',
  delete: 'Removeu',
  release: 'Liberou',
  reserve: 'Reservou',
  ingest: 'Atualizou via API',
  login: 'Fez login',
  change_password: 'Trocou senha',
  reset_password: 'Resetou senha',
  reset_password_apply: 'Aplicou reset',
};
const ACTION_TONES = {
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-blue-50 text-blue-700',
  delete: 'bg-rose-50 text-rose-700',
  release: 'bg-slate-100 text-slate-700',
  reserve: 'bg-amber-50 text-amber-700',
  ingest: 'bg-indigo-50 text-indigo-700',
  login: 'bg-slate-50 text-slate-500',
  change_password: 'bg-slate-50 text-slate-700',
  reset_password: 'bg-amber-50 text-amber-700',
  reset_password_apply: 'bg-emerald-50 text-emerald-700',
};

export default function Audit() {
  const [filters, setFilters] = useState({ entity: '', action: '', actor: '' });
  const [detail, setDetail] = useState(null);

  const { data: facets } = useQuery({
    queryKey: ['audit', 'entities'],
    queryFn: api.auditEntities,
  });
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () =>
      api.audit({
        ...(filters.entity ? { entity: filters.entity } : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.actor ? { actor: filters.actor } : {}),
        take: 200,
      }),
  });

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Quem mudou, o quê, quando e por quê. Toda alteração de dados gera um registro com o estado anterior e o novo. Apenas perfis ADMIN têm acesso."
        actions={
          <button onClick={() => refetch()} className="btn-ghost" disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
        }
      />

      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-slate-400 ml-1" />
        <select
          value={filters.entity}
          onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
          className="input w-auto"
        >
          <option value="">Tipo de objeto: todos</option>
          {(facets?.entities || []).map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABELS[e] || e}
            </option>
          ))}
        </select>
        <select
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          className="input w-auto"
        >
          <option value="">Ação: todas</option>
          {(facets?.actions || []).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] || a}
            </option>
          ))}
        </select>
        <input
          placeholder="Filtrar por usuário (ex: admin@)"
          value={filters.actor}
          onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
          className="input w-64"
        />
        <span className="ml-auto text-xs text-slate-500">
          {data?.total ?? 0} registro{data?.total === 1 ? '' : 's'}
        </span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left w-44">Quando</th>
              <th className="px-3 py-2 text-left w-44">Quem</th>
              <th className="px-3 py-2 text-left w-32">Ação</th>
              <th className="px-3 py-2 text-left">Objeto</th>
              <th className="px-3 py-2 text-left">Resumo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.items || []).map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                  {new Date(row.createdAt).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.actor || <span className="text-slate-400 italic">sistema</span>}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`badge ${ACTION_TONES[row.action] || 'bg-slate-100 text-slate-700'}`}
                  >
                    {ACTION_LABELS[row.action] || row.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="font-medium">
                    {ENTITY_LABELS[row.entity] || row.entity}
                  </span>{' '}
                  <span className="font-mono text-slate-400">#{row.entityId}</span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 truncate max-w-md">
                  {summarize(row)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setDetail(row)}
                    className="text-brand-600 hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    <Eye size={12} /> ver detalhe
                  </button>
                </td>
              </tr>
            ))}
            {data?.items?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  Nenhum registro com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detalhe da alteração"
        size="xl"
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quando">
                {new Date(detail.createdAt).toLocaleString('pt-BR')}
              </Field>
              <Field label="Quem">
                {detail.actor || <span className="text-slate-400">sistema</span>}
              </Field>
              <Field label="Ação">
                <span className={`badge ${ACTION_TONES[detail.action] || 'bg-slate-100'}`}>
                  {ACTION_LABELS[detail.action] || detail.action}
                </span>
              </Field>
              <Field label="Objeto">
                {ENTITY_LABELS[detail.entity] || detail.entity} #{detail.entityId}
              </Field>
              <Field label="IP de origem">
                {detail.ip ? (
                  <span className="font-mono">{detail.ip}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Field>
            </div>
            <DiffView before={detail.before} after={detail.after} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function summarize(row) {
  const b = row.before || {};
  const a = row.after || {};
  if (row.action === 'delete') {
    return b.code || b.name || b.address || b.email || `#${row.entityId}`;
  }
  if (row.action === 'create') {
    return a.code || a.name || a.address || a.email || `#${row.entityId}`;
  }
  // update: list changed fields
  const changes = [];
  for (const k of Object.keys(a)) {
    if (k === 'updatedAt' || k === 'createdAt' || k === 'lastLoginAt') continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      changes.push(k);
    }
  }
  if (changes.length === 0) return a.address || a.code || a.name || '';
  return `${(a.address || a.name || a.code || '')} · campos: ${changes.join(', ')}`;
}

function DiffView({ before, after }) {
  if (!before && !after) {
    return (
      <p className="text-slate-500 text-xs italic">Sem detalhes adicionais.</p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">
          Antes
        </div>
        <pre className="bg-rose-50/60 dark:bg-rose-900/20 rounded p-3 text-xs overflow-x-auto max-h-80">
          {before ? JSON.stringify(before, null, 2) : '(novo registro)'}
        </pre>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">
          Depois
        </div>
        <pre className="bg-emerald-50/60 dark:bg-emerald-900/20 rounded p-3 text-xs overflow-x-auto max-h-80">
          {after ? JSON.stringify(after, null, 2) : '(removido)'}
        </pre>
      </div>
    </div>
  );
}
