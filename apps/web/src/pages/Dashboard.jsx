import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Network,
  Globe,
  CheckCircle2,
  Server,
  Search,
  Calculator,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

function Stat({ icon: Icon, label, value, hint, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-50 text-slate-700',
  };
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${tones[tone]}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, hint }) {
  return (
    <Link
      to={to}
      className="card p-4 hover:border-brand-300 hover:shadow-sm transition flex items-start gap-3"
    >
      <div className="p-2 rounded-md bg-brand-50 text-brand-700">
        <Icon size={18} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
      <ArrowRight size={14} className="text-slate-300 mt-1" />
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const bySite = useQuery({ queryKey: ['stats', 'by-site'], queryFn: api.statsBySite });

  const s = stats.data || {};
  const utilization = s.ipCount ? ((s.used + s.reserved) / s.ipCount) * 100 : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Olá, ${user?.name || user?.email?.split('@')[0] || ''} 👋`}
        description="Esta é a tela inicial. Aqui você vê o resumo de uso dos endereços IP e tem atalhos para as tarefas mais comuns."
      />

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-3">O que você quer fazer?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            to="/sites"
            icon={Network}
            title="Ver IPs por site"
            hint="Navegue pelos sites e suas subnets"
          />
          <QuickAction
            to="/cidr"
            icon={Calculator}
            title="Calcular subnet/CIDR"
            hint="Quantos IPs cabem em um /24?"
          />
          <QuickAction
            to="/firewall"
            icon={Shield}
            title="Regras de firewall"
            hint="Consultar/editar regras"
          />
          <QuickAction
            to="/integrations"
            icon={Search}
            title="Integrar com Prometheus"
            hint="API e métricas para automação"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-3">Resumo</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={Globe} label="Sites" value={s.siteCount ?? '—'} tone="brand" />
          <Stat icon={Network} label="Subnets" value={s.subnetCount ?? '—'} tone="brand" />
          <Stat
            icon={Server}
            label="IPs em uso"
            value={s.used ?? '—'}
            hint={`${s.reserved || 0} reservados`}
            tone="blue"
          />
          <Stat
            icon={CheckCircle2}
            label="IPs livres"
            value={s.free ?? '—'}
            hint={`${utilization.toFixed(1)}% utilizado`}
            tone="emerald"
          />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">Utilização por site</h2>
            <p className="text-xs text-slate-500">Quanto de cada site já está ocupado</p>
          </div>
          <Link to="/sites" className="text-sm text-brand-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        <div className="space-y-3">
          {(bySite.data || []).map((site) => {
            const pct = site.total ? ((site.used + site.reserved) / site.total) * 100 : 0;
            const tone =
              pct > 80 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-400' : 'bg-emerald-500';
            return (
              <Link
                key={site.siteId}
                to="/sites"
                className="block hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg p-2 -mx-2 transition"
              >
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{site.code}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {site.used + site.reserved} / {site.total}{' '}
                    <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {site.subnetCount} subnets
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
