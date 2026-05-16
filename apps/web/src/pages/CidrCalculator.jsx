import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function calc(cidr) {
  const m = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const ip = m[1];
  const prefix = Number(m[2]);
  if (prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipToInt(ip) & mask;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = prefix === 32 ? 1 : prefix === 31 ? 2 : broadcast - network + 1;
  const usable = prefix >= 31 ? total : Math.max(0, total - 2);
  return {
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    mask: intToIp(mask),
    first: prefix >= 31 ? intToIp(network) : intToIp(network + 1),
    last: prefix >= 31 ? intToIp(broadcast) : intToIp(broadcast - 1),
    total,
    usable,
    prefix,
  };
}

export default function CidrCalculator() {
  const [input, setInput] = useState('10.150.0.0/24');
  const result = useMemo(() => calc(input.trim()), [input]);
  const { data: refs = [] } = useQuery({
    queryKey: ['cidr-ref'],
    queryFn: api.cidrReference,
  });

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Calculadora CIDR"
        description="Digite uma rede no formato 10.150.0.0/24 para ver quantos IPs cabem, qual é o primeiro/último endereço, máscara e broadcast."
      />

      <div className="card p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input font-mono"
          placeholder="10.0.0.0/24"
        />
        {result ? (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              ['Network', result.network],
              ['Broadcast', result.broadcast],
              ['Máscara', result.mask],
              ['Primeiro IP', result.first],
              ['Último IP', result.last],
              ['Prefixo', `/${result.prefix}`],
              ['Total', result.total.toLocaleString()],
              ['Utilizáveis', result.usable.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-slate-200 dark:border-slate-800 p-2">
                <div className="text-xs text-slate-500">{k}</div>
                <div className="font-mono">{v}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-rose-500">CIDR inválido</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-medium">
          Tabela de referência
        </div>
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
      </div>
    </div>
  );
}
