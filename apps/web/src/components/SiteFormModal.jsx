import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';

export default function SiteFormModal({ open, onClose, onSubmit, initial, loading, error }) {
  const [form, setForm] = useState({ code: '', name: '', description: '' });

  useEffect(() => {
    if (open) {
      setForm({
        code: initial?.code || '',
        name: initial?.name || '',
        description: initial?.description || '',
      });
    }
  }, [open, initial]);

  function submit(e) {
    e.preventDefault();
    onSubmit({
      code: form.code.trim(),
      name: form.name.trim() || form.code.trim(),
      description: form.description.trim() || null,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar site' : 'Novo site'}>
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 p-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm mb-1">
            Código <span className="text-rose-500">*</span>
          </label>
          <input
            required
            autoFocus
            placeholder="ex: SP3-NEW-DC"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="input font-mono"
            disabled={!!initial}
          />
          <p className="text-xs text-slate-500 mt-1">
            Identificador curto e único. Use letras, números e hífen.
          </p>
        </div>
        <div>
          <label className="block text-sm mb-1">Nome amigável</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ex: Datacenter SP3"
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Descrição</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="opcional"
            className="input"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button className="btn-primary" disabled={loading}>
            {loading ? 'Salvando…' : initial ? 'Salvar' : 'Criar site'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
