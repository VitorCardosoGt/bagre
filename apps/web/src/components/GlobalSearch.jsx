import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ ips: [], subnets: [], sites: [] });
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setResults({ ips: [], subnets: [], sites: [] });
      return;
    }
    const t = setTimeout(() => {
      api.search(q).then((r) => {
        setResults(r);
        setOpen(true);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const total = results.ips.length + results.subnets.length + results.sites.length;

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar IP, hostname, subnet…    (⌘K)"
          className="input pl-9"
        />
      </div>
      {open && total > 0 && (
        <div className="absolute mt-1 w-full card max-h-[60vh] overflow-auto z-50">
          {results.ips.length > 0 && (
            <div className="p-2">
              <div className="text-xs uppercase tracking-wider text-slate-500 px-2 mb-1">
                IPs
              </div>
              {results.ips.map((ip) => (
                <button
                  key={`ip-${ip.id}`}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between items-center"
                  onMouseDown={() => {
                    navigate(`/subnets/${ip.subnetId}?ip=${ip.address}`);
                    setOpen(false);
                  }}
                >
                  <span className="font-mono text-sm">{ip.address}</span>
                  <span className="text-xs text-slate-500 truncate ml-3">
                    {ip.hostname || ip.type || '—'}
                    {ip.subnet && (
                      <span className="ml-2 text-slate-400">
                        · {ip.subnet.site?.code} / {ip.subnet.name}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.subnets.length > 0 && (
            <div className="p-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs uppercase tracking-wider text-slate-500 px-2 mb-1">
                Subnets
              </div>
              {results.subnets.map((s) => (
                <button
                  key={`s-${s.id}`}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between"
                  onMouseDown={() => {
                    navigate(`/subnets/${s.id}`);
                    setOpen(false);
                  }}
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-slate-500">{s.cidr}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
