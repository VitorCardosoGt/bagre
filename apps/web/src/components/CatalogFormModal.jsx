import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';

// Generic form modal driven by a `fields` config:
//   [{ name, label, type?: 'text'|'number', required?, placeholder?, mono?, span? }]
// span: 'full' renders the field across both columns of a 2-col grid.
export default function CatalogFormModal({
  open,
  onClose,
  onSubmit,
  title,
  fields,
  initial,
  loading,
  error,
}) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      const f = {};
      for (const fld of fields) {
        const v = initial?.[fld.name];
        f[fld.name] = v == null ? '' : String(v);
      }
      setForm(f);
    }
  }, [open, initial, fields]);

  function submit(e) {
    e.preventDefault();
    const payload = {};
    for (const fld of fields) {
      const raw = form[fld.name];
      if (fld.type === 'number') {
        payload[fld.name] = raw === '' || raw == null ? null : Number(raw);
      } else {
        payload[fld.name] = raw === '' || raw == null ? null : String(raw).trim();
      }
    }
    onSubmit(payload);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={submit} className="space-y-3">
        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 p-2 rounded">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f, i) => (
            <div key={f.name} className={f.span === 'full' ? 'col-span-2' : ''}>
              <label className="block text-sm mb-1">
                {f.label}
                {f.required && <span className="text-rose-500"> *</span>}
              </label>
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                required={f.required}
                autoFocus={i === 0}
                placeholder={f.placeholder}
                value={form[f.name] ?? ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                className={`input ${f.mono ? 'font-mono text-sm' : ''}`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button className="btn-primary" disabled={loading}>
            {loading ? 'Salvando…' : initial ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
