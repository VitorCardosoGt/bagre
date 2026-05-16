import { AlertTriangle } from 'lucide-react';
import Modal from './Modal.jsx';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  destructive = false,
  loading = false,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex gap-3">
        {destructive && (
          <div className="p-2 rounded-md bg-rose-50 text-rose-600 h-fit">
            <AlertTriangle size={18} />
          </div>
        )}
        <div className="text-sm text-slate-700 dark:text-slate-300 flex-1">{message}</div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost" disabled={loading}>
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`btn ${
            destructive
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-brand-600 hover:bg-brand-700 text-white'
          }`}
        >
          {loading ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
