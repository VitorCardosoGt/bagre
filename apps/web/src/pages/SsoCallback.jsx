import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth as authStore } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function SsoCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    const next = params.get('next') || '/';
    if (!token) {
      navigate('/login?error=sso_failed', { replace: true });
      return;
    }
    authStore.setToken(token);
    refresh().then(() => navigate(next, { replace: true }));
  }, [params, navigate, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center auth-bg">
      <p className="text-slate-500 text-sm">Concluindo login…</p>
    </div>
  );
}
