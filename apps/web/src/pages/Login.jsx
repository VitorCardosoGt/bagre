import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogIn, AlertCircle, Mail, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const { data: cfg } = useQuery({
    queryKey: ['app-config'],
    queryFn: api.config,
    staleTime: 60_000,
  });
  const ssoEnabled = cfg?.auth?.oidc?.enabled;
  const ssoLabel = cfg?.auth?.oidc?.buttonLabel || 'Entrar com Microsoft';
  const signupEnabled = cfg?.auth?.signup?.enabled !== false;

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const user = await login(email, password);
      if (user.mustChangePwd) {
        navigate('/profile?force=1', { replace: true });
      } else {
        navigate(next, { replace: true });
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center auth-bg p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-10">
          <img
            src="/bagre-mascot.png"
            alt="Bagre"
            className="w-24 h-24 mx-auto mb-3 select-none"
            draggable="false"
          />
          <div className="text-2xl font-semibold tracking-tight">Bagre</div>
          <div className="text-sm text-slate-500 mt-0.5">IPAM opensource</div>
        </div>

        <form onSubmit={onSubmit} className="card-elevated p-7 space-y-5">
          <div className="space-y-1 mb-2">
            <h1 className="text-xl font-semibold">Bem-vindo de volta</h1>
            <p className="text-sm text-slate-500">Entre com suas credenciais para continuar</p>
          </div>

          {err && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 px-3 py-2.5 rounded-lg border border-rose-200 dark:border-rose-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              E-mail
            </label>
            <div className="relative">
              <Mail
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="email"
                autoFocus
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Senha
              </label>
              <Link
                to="/reset"
                className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
              >
                Esqueci a senha
              </Link>
            </div>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center py-2.5 text-base"
            disabled={loading}
          >
            <LogIn size={16} />
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          {ssoEnabled && (
            <>
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200 dark:border-slate-700" />
                </div>
                <span className="relative bg-white dark:bg-slate-900 px-3 text-xs text-slate-400 mx-auto block w-fit">
                  ou
                </span>
              </div>
              <a
                href={`/api/auth/sso/start?next=${encodeURIComponent(next)}`}
                className="btn w-full justify-center py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <MicrosoftLogo />
                {ssoLabel}
              </a>
            </>
          )}

          {signupEnabled && (
            <div className="text-center text-sm text-slate-500 pt-2">
              Ainda não tem conta?{' '}
              <Link
                to="/signup"
                className="text-brand-600 hover:text-brand-700 hover:underline"
              >
                Criar conta
              </Link>
            </div>
          )}
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Bagre · IPAM
        </p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}
