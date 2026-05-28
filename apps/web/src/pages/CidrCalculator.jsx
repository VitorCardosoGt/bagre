import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Split, Plus, ChevronsUpDown, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

const TABS = [
  { id: 'parse', label: 'Análise', icon: Search, hint: 'Info de um CIDR + onde já está no IPAM' },
  { id: 'split', label: 'Dividir', icon: Split, hint: 'Quebrar um CIDR em sub-redes menores' },
  { id: 'next', label: 'Próximas livres', icon: Plus, hint: 'Sugere subnets disponíveis dentro de um parent' },
  { id: 'merge', label: 'Supernet', icon: ChevronsUpDown, hint: 'Achar o menor CIDR que contém vários' },
];

export default function CidrCalculator() {
  const [tab, setTab] = useState('parse');
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Calculadora CIDR"
        description="Análise, divisão, próximas subnets livres e supernet — tudo cruzado com o estado real do IPAM."
      />

      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.hint}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap inline-flex items-center gap-1.5 ${
                tab === t.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'parse' && <ParseTab />}
      {tab === 'split' && <SplitTab />}
      {tab === 'next' && <NextFreeTab />}
      {tab === 'merge' && <MergeTab />}
    </div>
  );
}

// ===================================================================
// Tab 1 — Análise (parse com IPAM overlap)
// ===================================================================
function ParseTab() {
  const [input, setInput] = useState('10.0.0.0/24');
  const { data, isFetching, error } = useQuery({
    queryKey: ['cidr-parse', input],
    queryFn: () => api.cidrParse(input),
    enabled: !!input,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="text-xs text-slate-500 block mb-1">CIDR</label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input font-mono"
          placeholder="10.0.0.0/24"
        />
        {error && <p className="mt-2 text-sm text-rose-500">{error.message}</p>}
      </div>

      {data && !error && (
        <>
          <div className="card p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Field k="Network" v={data.network} mono />
              <Field k="Broadcast" v={data.broadcast} mono />
              <Field k="Máscara" v={data.mask} mono />
              <Field k="Primeiro IP" v={data.first} mono />
              <Field k="Último IP" v={data.last} mono />
              <Field k="Prefixo" v={`/${data.prefix}`} />
              <Field k="Total" v={data.total.toLocaleString()} />
              <Field k="Utilizáveis" v={data.usable.toLocaleString()} />
            </div>
          </div>

          {data.withinMasters?.length > 0 && (
            <div className="card p-4 bg-emerald-50/30 dark:bg-emerald-900/10 border-l-4 border-l-emerald-500">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Dentro de {data.withinMasters.length} master range{data.withinMasters.length > 1 ? 's' : ''}</div>
                  <ul className="mt-1 text-sm space-y-0.5">
                    {data.withinMasters.map((m, i) => (
                      <li key={i} className="font-mono text-xs">
                        <strong>{m.cidr}</strong>
                        {m.description && <span className="text-slate-500"> · {m.description}</span>}
                        {m.category && <span className="text-slate-400"> · {m.category}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {data.overlappingSubnets?.length > 0 && (
            <div className="card p-4 bg-amber-50/30 dark:bg-amber-900/10 border-l-4 border-l-amber-500">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">{data.overlappingSubnets.length} subnet{data.overlappingSubnets.length > 1 ? 's' : ''} já no IPAM se sobrepõe{data.overlappingSubnets.length > 1 ? 'm' : ''} a este CIDR</div>
                  <table className="w-full text-sm mt-2">
                    <tbody className="divide-y divide-amber-200/50 dark:divide-amber-800/30">
                      {data.overlappingSubnets.map((s) => (
                        <tr key={s.id}>
                          <td className="py-1.5 font-mono text-xs">{s.cidr}</td>
                          <td className="py-1.5">{s.name}</td>
                          <td className="py-1.5 text-xs text-slate-500">{RELATIONS[s.relation]}</td>
                          <td className="py-1.5 text-right">
                            <Link to={`/subnets/${s.id}`} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5">
                              abrir <ExternalLink size={10} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {data.overlappingSubnets?.length === 0 && data.withinMasters?.length === 0 && (
            <div className="card p-4 text-sm text-slate-500">
              Sem sobreposição com subnets do IPAM. Sem master range correspondente. CIDR "livre".
            </div>
          )}
        </>
      )}

      {isFetching && <div className="text-sm text-slate-400">Analisando…</div>}

      <CidrReferenceTable />
    </div>
  );
}

const RELATIONS = {
  'subnet-of-input': 'subnet do CIDR informado',
  'supernet-of-input': 'CIDR informado está DENTRO desta',
  'partial-overlap': 'sobreposição parcial ⚠',
};

// ===================================================================
// Tab 2 — Dividir
// ===================================================================
function SplitTab() {
  const [cidr, setCidr] = useState('10.0.0.0/24');
  const [prefix, setPrefix] = useState(26);
  const mut = useMutation({ mutationFn: () => api.cidrSplit(cidr, prefix) });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-3 items-end">
          <div className="col-span-2">
            <label className="text-xs text-slate-500 block mb-1">CIDR a dividir</label>
            <input value={cidr} onChange={(e) => setCidr(e.target.value)} className="input font-mono w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Prefixo alvo</label>
            <input
              type="number"
              min="0"
              max="32"
              value={prefix}
              onChange={(e) => setPrefix(Number(e.target.value))}
              className="input font-mono w-full"
            />
          </div>
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="btn-primary mt-3 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Split size={13} />
          {mut.isPending ? 'Dividindo…' : 'Dividir'}
        </button>
        {mut.error && <p className="mt-2 text-sm text-rose-500">{mut.error.message}</p>}
      </div>

      {mut.data && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-sm">
            <strong>{mut.data.parent}</strong> → <strong>{mut.data.count}</strong> ×{' '}
            <strong>/{mut.data.targetPrefix}</strong>
          </div>
          <table className="w-full text-sm table-zebra">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">CIDR</th>
                <th className="px-3 py-2 text-left">Network</th>
                <th className="px-3 py-2 text-left">Broadcast</th>
                <th className="px-3 py-2 text-right">Utilizáveis</th>
                <th className="px-3 py-2 text-left">Em uso?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {mut.data.results.map((r) => (
                <tr key={r.cidr} className={r.inUse ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}>
                  <td className="px-3 py-1.5 font-mono">{r.cidr}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.network}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.broadcast}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.usable.toLocaleString()}</td>
                  <td className="px-3 py-1.5">
                    {r.inUse ? (
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        ⚠ {r.conflicts.map((c) => c.name).join(', ')}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-600">livre</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// Tab 3 — Próximas livres
// ===================================================================
function NextFreeTab() {
  const [parent, setParent] = useState('10.0.0.0/16');
  const [prefix, setPrefix] = useState(24);
  const mut = useMutation({ mutationFn: () => api.cidrNextFree(parent, prefix, 10) });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-3 items-end">
          <div className="col-span-2">
            <label className="text-xs text-slate-500 block mb-1">Parent CIDR (espaço de busca)</label>
            <input value={parent} onChange={(e) => setParent(e.target.value)} className="input font-mono w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Tamanho desejado</label>
            <input
              type="number"
              min="0"
              max="32"
              value={prefix}
              onChange={(e) => setPrefix(Number(e.target.value))}
              className="input font-mono w-full"
              placeholder="/24"
            />
          </div>
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="btn-primary mt-3 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Plus size={13} />
          {mut.isPending ? 'Buscando…' : 'Buscar livres'}
        </button>
        {mut.error && <p className="mt-2 text-sm text-rose-500">{mut.error.message}</p>}
      </div>

      {mut.data && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-sm">
            Examinei <strong>{mut.data.examined.toLocaleString()}</strong> slots dentro de <strong>{mut.data.parent}</strong>{' '}
            · <strong>{mut.data.freeFound}</strong> livre{mut.data.freeFound !== 1 ? 's' : ''} (limite {mut.data.limit})
          </div>
          {mut.data.results.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Nenhuma subnet /{mut.data.targetPrefix} livre encontrada dentro de {mut.data.parent}.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {mut.data.results.map((r) => (
                <li key={r.cidr} className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="font-mono">{r.cidr}</span>
                  <span className="text-xs text-slate-500">
                    {r.network} → {r.broadcast} · {r.usable.toLocaleString()} IPs utilizáveis
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ===================================================================
// Tab 4 — Supernet / Merge
// ===================================================================
function MergeTab() {
  const [text, setText] = useState('10.0.1.0/24\n10.0.2.0/24\n10.0.3.0/24');
  const mut = useMutation({
    mutationFn: () => {
      const cidrs = text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      return api.cidrMerge(cidrs);
    },
  });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="text-xs text-slate-500 block mb-1">CIDRs (um por linha, ou separados por espaço)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input font-mono w-full"
          rows={6}
          placeholder="10.0.1.0/24&#10;10.0.2.0/24"
        />
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="btn-primary mt-3 inline-flex items-center gap-1 disabled:opacity-50"
        >
          <ChevronsUpDown size={13} />
          {mut.isPending ? 'Calculando…' : 'Achar supernet'}
        </button>
        {mut.error && <p className="mt-2 text-sm text-rose-500">{mut.error.message}</p>}
      </div>

      {mut.data && (
        <div className="card p-4">
          <div className="text-xs text-slate-500 mb-1">
            Menor CIDR que cobre os {mut.data.inputCount} inputs:
          </div>
          <div className="font-mono text-2xl mb-3">{mut.data.supernet.cidr}</div>
          {!mut.data.allContained && (
            <div className="text-xs text-amber-700 dark:text-amber-300 mb-3">
              ⚠ {mut.data.warning}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field k="Network" v={mut.data.supernet.network} mono />
            <Field k="Broadcast" v={mut.data.supernet.broadcast} mono />
            <Field k="Máscara" v={mut.data.supernet.mask} mono />
            <Field k="Total" v={mut.data.supernet.total.toLocaleString()} />
            <Field k="Utilizáveis" v={mut.data.supernet.usable.toLocaleString()} />
            <Field k="Prefixo" v={`/${mut.data.supernet.prefix}`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// Tabela de referência (compartilhada na tab Análise)
// ===================================================================
function CidrReferenceTable() {
  const { data: refs = [] } = useQuery({
    queryKey: ['cidr-ref'],
    queryFn: api.cidrReference,
  });

  if (!refs.length) return null;

  return (
    <details className="card overflow-hidden">
      <summary className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-medium cursor-pointer text-sm">
        Tabela de referência de prefixos
      </summary>
      <table className="w-full text-sm table-zebra">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Prefixo</th>
            <th className="px-3 py-2 text-left">Máscara</th>
            <th className="px-3 py-2 text-left">Total</th>
            <th className="px-3 py-2 text-left">Utilizáveis</th>
            <th className="px-3 py-2 text-left">/24s</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {refs.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-1.5 font-mono">{r.prefix}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{r.mask}</td>
              <td className="px-3 py-1.5">{r.total ?? '—'}</td>
              <td className="px-3 py-1.5">{r.usable ?? '—'}</td>
              <td className="px-3 py-1.5 text-xs">{r.networksPer24 || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Field({ k, v, mono }) {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-800 p-2">
      <div className="text-xs text-slate-500">{k}</div>
      <div className={mono ? 'font-mono' : ''}>{v}</div>
    </div>
  );
}
