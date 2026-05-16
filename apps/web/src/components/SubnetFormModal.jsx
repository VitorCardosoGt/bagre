import { useState, useEffect, useMemo } from 'react';
import Modal from './Modal.jsx';

const CIDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/;

function previewIps(cidr) {
  const m = cidr && cidr.match(CIDR_RE);
  if (!m) return null;
  const prefix = Number(m[2]);
  if (prefix < 16 || prefix > 32) return null;
  const total = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);
  const usable = prefix >= 31 ? total : Math.max(0, total - 2);
  return { total, usable };
}

export default function SubnetFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  siteCode,
  loading,
  error,
}) {
  const [form, setForm] = useState({
    name: '',
    cidr: '',
    vlanId: '',
    description: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name || '',
        cidr: initial?.cidr || '',
        vlanId: initial?.vlanId ? String(initial.vlanId) : '',
        description: initial?.description || '',
      });
    }
  }, [open, initial]);

  const preview = useMemo(() => previewIps(form.cidr), [form.cidr]);

  function submit(e) {
    e.preventDefault();
    onSubmit({
      name: form.name.trim(),
      cidr: form.cidr.trim() || null,
      vlanId: form.vlanId ? Number(form.vlanId) : null,
      description: form.description.trim() || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Editar subnet' : 'Nova subnet'}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-3">
        {siteCode && (
          <div className="text-xs text-slate-500">
            no site <span className="font-mono font-semibold">{siteCode}</span>
          </div>
        )}
        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 p-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm mb-1">
            Nome <span className="text-rose-500">*</span>
          </label>
          <input
            required
            autoFocus
            placeholder="ex: LAN-PROD"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
          <p className="text-xs text-slate-500 mt-1">
            Nome curto que identifica a subnet dentro do site.
          </p>
        </div>
        <div>
          <label className="block text-sm mb-1">
            CIDR {!initial && <span className="text-rose-500">*</span>}
          </label>
          <input
            required={!initial}
            placeholder="ex: 10.150.0.0/24"
            value={form.cidr}
            onChange={(e) => setForm({ ...form, cidr: e.target.value })}
            className="input font-mono"
            disabled={!!initial}
          />
          {!initial && (
            <p className="text-xs mt-1">
              {preview ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  ✓ Vai gerar <strong>{preview.usable}</strong> IPs utilizáveis
                  ({preview.total} no total)
                </span>
              ) : form.cidr ? (
                <span className="text-amber-600">
                  Formato inválido. Use algo como 10.0.0.0/24
                </span>
              ) : (
                <span className="text-slate-500">
                  Os IPs serão criados automaticamente ao salvar.
                </span>
              )}
            </p>
          )}
          {initial && (
            <p className="text-xs text-slate-500 mt-1">
              CIDR não pode ser alterado depois (afetaria os IPs já cadastrados).
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">VLAN ID</label>
            <input
              type="number"
              placeholder="opcional"
              value={form.vlanId}
              onChange={(e) => setForm({ ...form, vlanId: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Descrição</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="opcional"
              className="input"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button className="btn-primary" disabled={loading}>
            {loading ? 'Salvando…' : initial ? 'Salvar' : 'Criar subnet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
