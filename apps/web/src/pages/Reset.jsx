import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';

export default function Reset() {
  const [params] = useSearchParams();
  const initialToken = params.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState(initialToken ? 'apply' : 'request');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function requestReset(e) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await api.resetRequest(email);
      setMsg(
        'Pedido recebido. Se o e-mail existir, um administrador receberá o token nos logs do servidor. (No MVP local, peça o token a um admin — ele aparece no console da API.)',
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function applyReset(e) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setErr('As senhas não conferem');
      return;
    }
    if (newPassword.length < 8) {
      setErr('A senha precisa ter pelo menos 8 caracteres');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      await api.resetApply(token, newPassword);
      setMsg('Senha redefinida! Você já pode entrar.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-2xl font-semibold tracking-tight">
            <span className="text-brand-600">Duo</span>system
          </div>
          <div className="text-sm text-slate-400">IPAM</div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between gap-2 text-sm">
            <button
              onClick={() => {
                setPhase('request');
                setErr(null);
                setMsg(null);
              }}
              className={`flex-1 py-1 rounded ${
                phase === 'request'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              1. Solicitar
            </button>
            <button
              onClick={() => {
                setPhase('apply');
                setErr(null);
                setMsg(null);
              }}
              className={`flex-1 py-1 rounded ${
                phase === 'apply'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              2. Aplicar token
            </button>
          </div>

          {err && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 p-2 rounded">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
          {msg && (
            <div className="flex items-start gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 p-2 rounded">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{msg}</span>
            </div>
          )}

          {phase === 'request' ? (
            <form onSubmit={requestReset} className="space-y-3">
              <h1 className="text-lg font-semibold">Solicitar reset</h1>
              <div>
                <label className="block text-sm mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                />
              </div>
              <button className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? 'Enviando…' : 'Solicitar token'}
              </button>
            </form>
          ) : (
            <form onSubmit={applyReset} className="space-y-3">
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <KeyRound size={18} /> Aplicar token
              </h1>
              <div>
                <label className="block text-sm mb-1">Token recebido</label>
                <input
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="input font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Nova senha</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Confirme</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input"
                />
              </div>
              <button className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? 'Aplicando…' : 'Redefinir senha'}
              </button>
            </form>
          )}

          <div className="text-sm text-center pt-2">
            <Link to="/login" className="text-brand-600 hover:underline">
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
