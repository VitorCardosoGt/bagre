import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Save,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Power,
  Activity,
} from 'lucide-react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';

const HELP_LINK =
  'https://learn.microsoft.com/azure/active-directory/develop/quickstart-register-app';

export default function SsoSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ['oidc-config'],
    queryFn: api.oidcConfig,
  });
  const [form, setForm] = useState(null);
  const [groupsCsv, setGroupsCsv] = useState('');

  useEffect(() => {
    if (cfg && !form) {
      setForm({
        enabled: cfg.enabled,
        buttonLabel: cfg.buttonLabel || 'Entrar com Microsoft',
        issuerUrl: cfg.issuerUrl || '',
        clientId: cfg.clientId || '',
        clientSecret: '',
        redirectUri:
          cfg.redirectUri ||
          (typeof window !== 'undefined'
            ? `${window.location.origin}/api/auth/sso/callback`
            : ''),
        scopes: cfg.scopes || 'openid profile email',
        groupsClaim: cfg.groupsClaim || 'groups',
        emailClaim: cfg.emailClaim || 'email',
        nameClaim: cfg.nameClaim || 'name',
        autoProvision: cfg.autoProvision,
        defaultRole: cfg.defaultRole,
      });
      setGroupsCsv((cfg.adminGroups || []).join(', '));
    }
  }, [cfg, form]);

  const save = useMutation({
    mutationFn: api.updateOidcConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oidc-config'] });
      qc.invalidateQueries({ queryKey: ['app-config'] });
      toast.success('Configurações salvas.');
    },
    onError: (e) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: api.testOidcConfig,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['oidc-config'] });
      if (r.ok) toast.success('Conexão OK · ' + r.message);
      else toast.error('Falhou: ' + r.message);
    },
    onError: (e) => toast.error(e.message),
  });

  const enable = useMutation({
    mutationFn: () => api.updateOidcConfig({ enabled: !form.enabled }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['oidc-config'] });
      qc.invalidateQueries({ queryKey: ['app-config'] });
      setForm((f) => ({ ...f, enabled: r.enabled }));
      toast.success(r.enabled ? 'SSO habilitado' : 'SSO desabilitado');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !form) {
    return <p className="text-slate-500">Carregando…</p>;
  }

  const submit = (e) => {
    e.preventDefault();
    const data = {
      buttonLabel: form.buttonLabel,
      issuerUrl: form.issuerUrl.trim(),
      clientId: form.clientId.trim(),
      redirectUri: form.redirectUri.trim(),
      scopes: form.scopes.trim(),
      groupsClaim: form.groupsClaim.trim(),
      emailClaim: form.emailClaim.trim(),
      nameClaim: form.nameClaim.trim(),
      autoProvision: form.autoProvision,
      defaultRole: form.defaultRole,
      adminGroups: groupsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (form.clientSecret) data.clientSecret = form.clientSecret;
    save.mutate(data);
  };

  const fullyConfigured =
    cfg?.issuerUrl && cfg?.clientId && cfg?.hasClientSecret && cfg?.redirectUri;

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="SSO / Microsoft Entra ID"
        description="Permita que usuários entrem com a conta corporativa (Azure AD / Entra ID). O login local continua funcionando em paralelo — perfeito para evitar lockout caso o IdP fique fora do ar."
        actions={
          <button
            onClick={() => enable.mutate()}
            disabled={!fullyConfigured || enable.isPending}
            className={form.enabled ? 'btn-danger' : 'btn-primary'}
            title={!fullyConfigured ? 'Configure tudo antes de habilitar' : ''}
          >
            <Power size={14} />
            {form.enabled ? 'Desabilitar SSO' : 'Habilitar SSO'}
          </button>
        }
      />

      <StatusBanner cfg={cfg} fullyConfigured={fullyConfigured} />

      <form onSubmit={submit} className="space-y-5">
        <Section
          title="1. Crie um App Registration no Microsoft Entra ID"
          subtitle={
            <>
              No portal Azure → Microsoft Entra ID → App registrations → "New
              registration". Em "Redirect URI" cole o valor abaixo. Depois copie
              os IDs e gere um Client Secret.{' '}
              <a
                href={HELP_LINK}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                guia oficial <ExternalLink size={12} />
              </a>
            </>
          }
        >
          <Field label="Redirect URI (cole esta no Entra ID)">
            <CopyInput value={form.redirectUri} />
            <input
              value={form.redirectUri}
              onChange={(e) => setForm({ ...form, redirectUri: e.target.value })}
              className="input mt-2 font-mono text-xs"
            />
          </Field>
        </Section>

        <Section title="2. Cole os dados do Entra ID aqui">
          <Field
            label="Issuer URL"
            hint="Para Entra ID: https://login.microsoftonline.com/{TENANT_ID}/v2.0"
          >
            <input
              required
              value={form.issuerUrl}
              onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
              placeholder="https://login.microsoftonline.com/<tenant>/v2.0"
              className="input font-mono text-xs"
            />
          </Field>
          <Field label="Application (client) ID">
            <input
              required
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="input font-mono text-xs"
            />
          </Field>
          <Field
            label="Client Secret"
            hint={
              cfg?.hasClientSecret
                ? 'Já existe um secret salvo. Deixe em branco para mantê-lo, ou cole um novo para substituir.'
                : 'Gerado em "Certificates & secrets" no Entra ID.'
            }
          >
            <input
              type="password"
              value={form.clientSecret}
              onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
              placeholder={cfg?.hasClientSecret ? '•••••••• (mantém o atual)' : ''}
              className="input"
            />
          </Field>
        </Section>

        <Section title="3. Mapeamento de perfis (opcional)">
          <Field
            label="Grupos que recebem perfil ADMIN"
            hint="Object IDs dos grupos no Entra ID, separados por vírgula. Usuário em qualquer um deles vira ADMIN. Se vazio, ninguém é promovido automaticamente — defina o papel manualmente."
          >
            <input
              value={groupsCsv}
              onChange={(e) => setGroupsCsv(e.target.value)}
              placeholder="aaaaaaaa-..., bbbbbbbb-..."
              className="input font-mono text-xs"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Perfil padrão para novos usuários">
              <select
                value={form.defaultRole}
                onChange={(e) => setForm({ ...form, defaultRole: e.target.value })}
                className="input"
              >
                <option value="READER">READER (somente leitura)</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </Field>
            <Field label="Provisionamento automático">
              <label className="inline-flex items-center gap-2 text-sm pt-2">
                <input
                  type="checkbox"
                  checked={form.autoProvision}
                  onChange={(e) =>
                    setForm({ ...form, autoProvision: e.target.checked })
                  }
                  className="accent-brand-600"
                />
                Criar usuário no primeiro login (recomendado)
              </label>
            </Field>
          </div>
        </Section>

        <Section title="4. Avançado (claims)">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Claim de e-mail">
              <input
                value={form.emailClaim}
                onChange={(e) => setForm({ ...form, emailClaim: e.target.value })}
                className="input font-mono text-xs"
              />
            </Field>
            <Field label="Claim de nome">
              <input
                value={form.nameClaim}
                onChange={(e) => setForm({ ...form, nameClaim: e.target.value })}
                className="input font-mono text-xs"
              />
            </Field>
            <Field label="Claim de grupos">
              <input
                value={form.groupsClaim}
                onChange={(e) => setForm({ ...form, groupsClaim: e.target.value })}
                className="input font-mono text-xs"
              />
            </Field>
          </div>
          <Field label="Scopes">
            <input
              value={form.scopes}
              onChange={(e) => setForm({ ...form, scopes: e.target.value })}
              className="input font-mono text-xs"
            />
          </Field>
          <Field label="Texto do botão na tela de login">
            <input
              value={form.buttonLabel}
              onChange={(e) => setForm({ ...form, buttonLabel: e.target.value })}
              className="input"
            />
          </Field>
        </Section>

        <div className="flex items-center gap-2 sticky bottom-0 bg-white/90 dark:bg-slate-900/80 backdrop-blur p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            <Save size={14} />
            {save.isPending ? 'Salvando…' : 'Salvar configurações'}
          </button>
          <button
            type="button"
            onClick={() => test.mutate()}
            className="btn-ghost"
            disabled={test.isPending}
          >
            <Activity size={14} />
            {test.isPending ? 'Testando…' : 'Testar conexão'}
          </button>
          {cfg?.lastTestedAt && (
            <span className="text-xs text-slate-500 ml-auto">
              último teste:{' '}
              <span
                className={
                  cfg.lastTestStatus === 'ok' ? 'text-emerald-600' : 'text-rose-600'
                }
              >
                {cfg.lastTestStatus === 'ok' ? '✓' : '✗'}{' '}
                {new Date(cfg.lastTestedAt).toLocaleString('pt-BR')}
              </span>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function StatusBanner({ cfg, fullyConfigured }) {
  if (!cfg) return null;
  if (cfg.enabled && fullyConfigured) {
    return (
      <div className="card p-4 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 flex items-start gap-3">
        <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" />
        <div className="text-sm">
          <strong>SSO ativo.</strong> A tela de login mostra o botão{' '}
          <em>"{cfg.buttonLabel}"</em>. Login local continua disponível em paralelo.
        </div>
      </div>
    );
  }
  if (!fullyConfigured) {
    return (
      <div className="card p-4 border-slate-200 flex items-start gap-3">
        <KeyRound size={18} className="text-slate-400 mt-0.5" />
        <div className="text-sm">
          <strong>SSO não configurado.</strong> Preencha os campos abaixo e clique em
          "Testar conexão". O botão "Habilitar SSO" só fica disponível quando todos os
          campos obrigatórios estão preenchidos.
        </div>
      </div>
    );
  }
  return (
    <div className="card p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 flex items-start gap-3">
      <AlertCircle size={18} className="text-amber-600 mt-0.5" />
      <div className="text-sm">
        <strong>Configurado, mas desabilitado.</strong> A tela de login não mostra o
        botão de SSO ainda. Use "Habilitar SSO" no topo desta página quando estiver
        pronto.
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function CopyInput({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input value={value} readOnly className="input font-mono text-xs" />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn-ghost"
      >
        {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
        {copied ? 'copiado' : 'copiar'}
      </button>
    </div>
  );
}
