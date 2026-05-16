import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((s) => s.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = Date.now() + Math.random();
      const t = {
        id,
        kind: toast.kind || 'info',
        title: toast.title,
        message: toast.message,
        ttl: toast.ttl ?? 4000,
      };
      setItems((s) => [...s, t]);
      if (t.ttl > 0) {
        setTimeout(() => dismiss(id), t.ttl);
      }
      return id;
    },
    [dismiss],
  );

  const value = {
    push,
    dismiss,
    success: (msg, opts = {}) => push({ kind: 'success', message: msg, ...opts }),
    error: (msg, opts = {}) => push({ kind: 'error', message: msg, ...opts }),
    info: (msg, opts = {}) => push({ kind: 'info', message: msg, ...opts }),
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

function ToastItem({ toast, onClose }) {
  const conf = {
    success: {
      icon: CheckCircle2,
      cls: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200',
      iconCls: 'text-emerald-500',
    },
    error: {
      icon: AlertCircle,
      cls: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200',
      iconCls: 'text-rose-500',
    },
    info: {
      icon: Info,
      cls: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
      iconCls: 'text-brand-500',
    },
  };
  const c = conf[toast.kind] || conf.info;
  const Icon = c.icon;
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-card animate-slide-down ${c.cls}`}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${c.iconCls}`} />
      <div className="flex-1 min-w-0 text-sm">
        {toast.title && <div className="font-medium">{toast.title}</div>}
        {toast.message && <div className="text-[13px] opacity-90">{toast.message}</div>}
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 -m-1 p-1"
      >
        <X size={14} />
      </button>
    </div>
  );
}
