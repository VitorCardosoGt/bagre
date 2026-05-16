import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, AlertCircle, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: cfg } = useQuery({
    queryKey: ['app-config'],
    queryFn: api.config,
    staleTime: 60_000,
  });
  const signupEnabled = cfg?.auth?.signup?.enabled !== false;
  const allowedDomains = cfg?.auth?.signup?.allowedDomains || [];

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setErr('As senhas não coincidem.');
      return;
    }
    const domain = email.trim().toLowerCase().split('@')[1];
    if (allowedDomains.length > 0 && !allowedDomains.map((d) => d.toLowerCase()).includes(domain)) {
      setErr(`E-mail precisa ser de: ${allowedDomains.join(', ')}`);
      return;
    }
    setLoading(true);
    try {
      await signup({ email: email.trim().toLowerCase(), password, name: name.trim() || undefined });
      navigate('/', { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!signupEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center auth-bg p-4">
        <div className="w-full max-w-md text-center card-elevated p-8">
          <AlertCircle className="mx-auto text-rose-500 mb-3" size={32} />
          <h1 className="text-lg font-semibold mb-2">Cadastro indisponível</h1>
          <p className="text-sm text-slate-500 mb-5">
            O cadastro de novas contas está desativado neste ambiente. Solicite acesso ao
            administrador.
          </p>
          <Link to="/login" className="btn-primary inline-flex">
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center auth-bg p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow mb-4">
            <span className="text-white text-xl font-bold">D</span>
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            <span className="text-brand-600">Duo</span>
            <span>system</span>
          </div>
          <div className="text-sm text-slate-500 mt-0.5">Gestão de IPs · IPAM</div>
        </div>

        <form onSubmit={onSubmit} className="card-elevated p-7 space-y-5">
          <div className="space-y-1 mb-2">
            <h1 className="text-xl font-semibold">Criar conta</h1>
            <p className="text-sm text-slate-500">
              Você entrará com perfil de leitura. Um administrador pode promover sua conta depois.
            </p>
          </div>

          {err && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 px-3 py-2.5 rounded-lg border border-rose-200 dark:border-rose-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nome
            </label>
            <div className="relative">
              <User
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                autoFocus
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

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
                required
                placeholder={
                  allowedDomains.length === 1 ? `seu.nome@${allowedDomains[0]}` : 'seu@email.com'
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
              />
            </div>
            {allowedDomains.length > 0 && (
              <p className="text-xs text-slate-400">
                Domínios permitidos: {allowedDomains.join(', ')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Senha
            </label>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mín. 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirmar senha
            </label>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center py-2.5 text-base"
            disabled={loading}
          >
            <UserPlus size={16} />
            {loading ? 'Criando…' : 'Criar conta'}
          </button>

          <div className="text-center text-sm text-slate-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 hover:underline">
              Entrar
            </Link>
          </div>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Bagre · IPAM
        </p>
      </div>
    </div>
  );
}
