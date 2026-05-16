import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Lock } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';

const FIELDS = [
  ['direction', 'Sentido'],
  ['inIface', 'Incoming Iface'],
  ['outIface', 'Outgoing Iface'],
  ['src', 'Origem'],
  ['dst', 'Destino'],
  ['port', 'Porta'],
  ['service', 'Serviço'],
  ['protocol', 'Protocolo'],
];

export default function Firewall() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN';
  const { data = [] } = useQuery({ queryKey: ['fw'], queryFn: api.firewallRules });
  const create = useMutation({
    mutationFn: api.createFirewallRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fw'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }) => api.updateFirewallRule(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fw'] }),
  });
  const remove = useMutation({
    mutationFn: api.deleteFirewallRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fw'] }),
  });

  return (
    <div>
      <PageHeader
        title="Regras de Firewall"
        description="Regras de tráfego entre redes (Azure ↔ Equinix). Cada linha representa uma regra. Clique nas células para editar."
        actions={
          canEdit ? (
            <button
              onClick={() =>
                create.mutate({
                  direction: '',
                  src: '',
                  dst: '',
                  service: '',
                  protocol: '',
                })
              }
              className="btn-primary"
            >
              <Plus size={14} /> Nova regra
            </button>
          ) : (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Lock size={12} /> somente leitura
            </span>
          )
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              {FIELDS.map(([_, label]) => (
                <th key={label} className="px-2 py-2 text-left">
                  {label}
                </th>
              ))}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                disabled={!canEdit}
                onSave={(data) => update.mutate({ id: rule.id, data })}
                onDelete={() => remove.mutate(rule.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RuleRow({ rule, onSave, onDelete, disabled }) {
  const [edit, setEdit] = useState(rule);
  const dirty = JSON.stringify(edit) !== JSON.stringify(rule);
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      {FIELDS.map(([key]) => (
        <td key={key} className="px-2 py-1">
          <input
            value={edit[key] || ''}
            disabled={disabled}
            onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
            className="input py-0.5 text-xs font-mono disabled:bg-transparent disabled:border-transparent"
          />
        </td>
      ))}
      <td className="px-2 py-1 text-right whitespace-nowrap">
        {dirty && !disabled && (
          <button
            onClick={() => onSave(edit)}
            className="text-xs px-2 py-0.5 rounded bg-brand-600 text-white hover:bg-brand-700 mr-1"
          >
            Salvar
          </button>
        )}
        {!disabled && (
          <button onClick={onDelete} className="text-rose-500 hover:text-rose-700 p-1">
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
