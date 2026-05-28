import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '../api.js';

const RANGES = [
  { id: 7, label: '7d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
];

const W = 720;
const H = 160;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 24;

function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function calcTrend(snapshots) {
  if (!snapshots || snapshots.length < 2) return { dir: 'flat', delta: 0 };
  // Compara média dos últimos 25% com média dos primeiros 25%
  const quarter = Math.max(1, Math.floor(snapshots.length / 4));
  const first = snapshots.slice(0, quarter);
  const last = snapshots.slice(-quarter);
  const avg = (arr) => arr.reduce((s, x) => s + x.usedCount, 0) / arr.length;
  const a = avg(first);
  const b = avg(last);
  const delta = b - a;
  if (Math.abs(delta) < 0.5) return { dir: 'flat', delta };
  return { dir: delta > 0 ? 'up' : 'down', delta };
}

export default function UtilizationChart({ subnetId, ipCount }) {
  const [days, setDays] = useState(30);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['subnet-history', subnetId, days],
    queryFn: () => api.subnetHistory(subnetId, days),
    enabled: !!subnetId,
  });

  const snapMut = useMutation({
    mutationFn: () => api.snapshotSubnet(subnetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subnet-history', subnetId] }),
  });

  const snapshots = data?.snapshots || [];

  const { path, points, xAxis, max } = useMemo(() => {
    if (!snapshots.length) return { path: '', points: [], xAxis: [], max: 0 };
    const max = Math.max(ipCount || 0, ...snapshots.map((s) => s.ipCount));
    const tMin = new Date(snapshots[0].takenAt).getTime();
    const tMax = new Date(snapshots[snapshots.length - 1].takenAt).getTime();
    const tSpan = Math.max(1, tMax - tMin);
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const x = (t) => PAD_L + ((new Date(t).getTime() - tMin) / tSpan) * innerW;
    const y = (v) => PAD_T + innerH - (v / max) * innerH;

    const pts = snapshots.map((s) => ({ x: x(s.takenAt), y: y(s.usedCount), s }));
    const path = pts
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    // Eixo X: 4 marcas
    const xAxis = [0, 0.33, 0.66, 1].map((f) => {
      const t = tMin + tSpan * f;
      return { x: x(t), label: fmtDate(t) };
    });

    return { path, points: pts, xAxis, max };
  }, [snapshots, ipCount]);

  const trend = calcTrend(snapshots);

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm">Histórico de utilização</h2>
          {snapshots.length >= 2 && (
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
              trend.dir === 'up'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : trend.dir === 'down'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-50 text-slate-600 border border-slate-200'
            }`}>
              {trend.dir === 'up' && <TrendingUp size={11} />}
              {trend.dir === 'down' && <TrendingDown size={11} />}
              {trend.dir === 'flat' && <Minus size={11} />}
              {trend.dir === 'flat'
                ? 'estável'
                : `${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(0)} IPs`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setDays(r.id)}
                className={`text-xs px-2.5 py-0.5 rounded ${
                  days === r.id
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => snapMut.mutate()}
            disabled={snapMut.isPending}
            title="Capturar snapshot agora (em vez de esperar o scheduler)"
            className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Camera size={11} /> Capturar agora
          </button>
        </div>
      </div>

      {isLoading && <div className="h-[160px] flex items-center justify-center text-xs text-slate-400">Carregando…</div>}

      {!isLoading && snapshots.length === 0 && (
        <div className="h-[160px] flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
          <span>Sem snapshots ainda nos últimos {days} dias.</span>
          <span className="text-slate-400">O scheduler captura a cada 60 min · ou clique "Capturar agora".</span>
        </div>
      )}

      {!isLoading && snapshots.length === 1 && (
        <div className="h-[160px] flex items-center justify-center text-xs text-slate-500">
          Apenas 1 snapshot capturado em {fmtDate(snapshots[0].takenAt)} ({snapshots[0].usedCount} IPs em uso). Aguarde mais snapshots para ver tendência.
        </div>
      )}

      {!isLoading && snapshots.length >= 2 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[160px]">
          {/* Grid horizontal */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = PAD_T + (H - PAD_T - PAD_B) * (1 - f);
            const v = Math.round(max * f);
            return (
              <g key={f}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1" />
                <text x={PAD_L - 6} y={y + 3} textAnchor="end" className="text-[10px] fill-slate-400 tabular-nums">{v}</text>
              </g>
            );
          })}
          {/* Eixo X labels */}
          {xAxis.map((tick, i) => (
            <text key={i} x={tick.x} y={H - 6} textAnchor="middle" className="text-[10px] fill-slate-400">{tick.label}</text>
          ))}
          {/* Linha de capacidade total */}
          {ipCount > 0 && (() => {
            const yCap = PAD_T + (H - PAD_T - PAD_B) * (1 - ipCount / max);
            return (
              <line
                x1={PAD_L} x2={W - PAD_R}
                y1={yCap} y2={yCap}
                stroke="currentColor"
                className="text-slate-300 dark:text-slate-600"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            );
          })()}
          {/* Área sob a linha (com cor brand) */}
          <path
            d={`${path} L ${points[points.length - 1].x} ${H - PAD_B} L ${points[0].x} ${H - PAD_B} Z`}
            className="fill-brand-500/10"
          />
          {/* Linha principal de IPs em uso */}
          <path d={path} fill="none" stroke="currentColor" className="text-brand-600" strokeWidth="2" />
          {/* Pontos com tooltip */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="2.5" className="fill-brand-600" />
              <title>
                {new Date(p.s.takenAt).toLocaleString('pt-BR')}{'\n'}
                {p.s.usedCount} em uso · {p.s.reservedCount} reservados · {p.s.freeCount} livres
              </title>
            </g>
          ))}
        </svg>
      )}

      {!isLoading && snapshots.length >= 2 && (
        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-brand-600 inline-block" />
            IPs em uso ao longo do tempo
          </span>
          {ipCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-slate-400 inline-block" />
              capacidade total ({ipCount})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
