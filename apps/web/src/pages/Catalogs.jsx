import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import CatalogFormModal from '../components/CatalogFormModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const TABS = [
  { id: 'master', label: 'Ranges Mestre' },
  { id: 'equinix', label: 'Equinix VLANs' },
  { id: 'azure', label: 'Azure Subnets' },
];

const MASTER_FIELDS = [
  { name: 'cidr', label: 'CIDR', required: true, placeholder: '10.0.0.0/24', mono: true },
  { name: 'description', label: 'Descrição', placeholder: 'opcional', span: 'full' },
  { name: 'category', label: 'Categoria', placeholder: 'ex: Equinix, Azure, Links' },
];

const EQUINIX_FIELDS = [
  { name: 'name', label: 'Nome', required: true, placeholder: 'ex: VLAN-PROD' },
  { name: 'vlanId', label: 'VLAN ID', type: 'number', placeholder: 'opcional' },
  { name: 'network', label: 'Network', placeholder: '10.0.0.0/24', mono: true, span: 'full' },
  { name: 'usage', label: 'Range', placeholder: '10.0.0.1 - 10.0.0.254', mono: true },
  { name: 'broadcast', label: 'Broadcast', placeholder: '10.0.0.255', mono: true },
];

const AZURE_FIELDS = [
  { name: 'name', label: 'Nome', required: true, placeholder: 'ex: SubnetWeb', span: 'full' },
  { name: 'network', label: 'Network', placeholder: '10.0.0.0/24', mono: true, span: 'full' },
  { name: 'usage', label: 'Range', placeholder: '10.0.0.1 - 10.0.0.254', mono: true },
  { name: 'broadcast', label: 'Broadcast', placeholder: '10.0.0.255', mono: true },
];

export default function Catalogs() {
  const [tab, setTab] = useState('master');
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN';

  return (
    <div>
      <PageHeader
        title="Catálogos"
        description="Listas de referência: ranges mestre da empresa, VLANs do datacenter Equinix e subnets do Azure."
      />

      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'master' && <MasterRanges canEdit={canEdit} />}
      {tab === 'equinix' && <Equinix canEdit={canEdit} />}
      {tab === 'azure' && <Azure canEdit={canEdit} />}
    </div>
  );
}

function useCrud({ key, list, create, update, remove }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [key], queryFn: list });
  const inv = () => qc.invalidateQueries({ queryKey: [key] });
  return {
    data: query.data || [],
    isLoading: query.isLoading,
    create: useMutation({ mutationFn: create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }) => update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: remove, onSuccess: inv }),
  };
}

function Toolbar({ canEdit, onNew, label }) {
  if (!canEdit) return null;
  return (
    <div className="flex justify-end mb-2">
      <button onClick={onNew} className="btn-primary text-xs py-1.5">
        <Plus size={13} /> {label}
      </button>
    </div>
  );
}

function ActionCell({ canEdit, onEdit, onDelete }) {
  if (!canEdit) return null;
  return (
    <td className="px-3 py-1.5 text-right whitespace-nowrap">
      <button
        onClick={onEdit}
        className="text-slate-400 hover:text-brand-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={onDelete}
        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 ml-1"
        title="Excluir"
      >
        <Trash2 size={14} />
      </button>
    </td>
  );
}

function MasterRanges({ canEdit }) {
  const crud = useCrud({
    key: 'master-ranges',
    list: api.masterRanges,
    create: api.createMasterRange,
    update: api.updateMasterRange,
    remove: api.deleteMasterRange,
  });
  const [modal, setModal] = useState({ open: false, initial: null });
  const [confirm, setConfirm] = useState({ open: false, id: null, label: '' });
  const [err, setErr] = useState(null);

  return (
    <div>
      <Toolbar canEdit={canEdit} label="Novo range mestre" onNew={() => { setErr(null); setModal({ open: true, initial: null }); }} />
      <div className="card overflow-hidden">
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">CIDR</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              {canEdit && <th className="px-3 py-2 w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {crud.data.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 font-mono text-xs">{r.cidr}</td>
                <td className="px-3 py-1.5">{r.description || '—'}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.category || '—'}</td>
                <ActionCell
                  canEdit={canEdit}
                  onEdit={() => { setErr(null); setModal({ open: true, initial: r }); }}
                  onDelete={() => setConfirm({ open: true, id: r.id, label: r.cidr })}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CatalogFormModal
        open={modal.open}
        onClose={() => setModal({ open: false, initial: null })}
        title={modal.initial ? 'Editar range mestre' : 'Novo range mestre'}
        fields={MASTER_FIELDS}
        initial={modal.initial}
        loading={crud.create.isPending || crud.update.isPending}
        error={err}
        onSubmit={(data) => {
          const mutation = modal.initial
            ? crud.update.mutate({ id: modal.initial.id, data }, {
                onSuccess: () => setModal({ open: false, initial: null }),
                onError: (e) => setErr(e.message),
              })
            : crud.create.mutate(data, {
                onSuccess: () => setModal({ open: false, initial: null }),
                onError: (e) => setErr(e.message),
              });
        }}
      />
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null, label: '' })}
        title="Excluir range mestre"
        message={<>Tem certeza que quer excluir <strong>{confirm.label}</strong>?</>}
        confirmLabel="Excluir"
        destructive
        loading={crud.remove.isPending}
        onConfirm={() => crud.remove.mutate(confirm.id, {
          onSuccess: () => setConfirm({ open: false, id: null, label: '' }),
        })}
      />
    </div>
  );
}

function Equinix({ canEdit }) {
  const crud = useCrud({
    key: 'equinix-vlans',
    list: api.equinixVlans,
    create: api.createEquinixVlan,
    update: api.updateEquinixVlan,
    remove: api.deleteEquinixVlan,
  });
  const [modal, setModal] = useState({ open: false, initial: null });
  const [confirm, setConfirm] = useState({ open: false, id: null, label: '' });
  const [err, setErr] = useState(null);

  return (
    <div>
      <Toolbar canEdit={canEdit} label="Nova VLAN Equinix" onNew={() => { setErr(null); setModal({ open: true, initial: null }); }} />
      <div className="card overflow-hidden">
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">VLAN</th>
              <th className="px-3 py-2 text-left">Network</th>
              <th className="px-3 py-2 text-left">Range</th>
              <th className="px-3 py-2 text-left">Broadcast</th>
              {canEdit && <th className="px-3 py-2 w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {crud.data.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.vlanId ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.network || '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.usage || '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.broadcast || '—'}</td>
                <ActionCell
                  canEdit={canEdit}
                  onEdit={() => { setErr(null); setModal({ open: true, initial: r }); }}
                  onDelete={() => setConfirm({ open: true, id: r.id, label: r.name })}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CatalogFormModal
        open={modal.open}
        onClose={() => setModal({ open: false, initial: null })}
        title={modal.initial ? 'Editar VLAN Equinix' : 'Nova VLAN Equinix'}
        fields={EQUINIX_FIELDS}
        initial={modal.initial}
        loading={crud.create.isPending || crud.update.isPending}
        error={err}
        onSubmit={(data) => {
          if (modal.initial) {
            crud.update.mutate({ id: modal.initial.id, data }, {
              onSuccess: () => setModal({ open: false, initial: null }),
              onError: (e) => setErr(e.message),
            });
          } else {
            crud.create.mutate(data, {
              onSuccess: () => setModal({ open: false, initial: null }),
              onError: (e) => setErr(e.message),
            });
          }
        }}
      />
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null, label: '' })}
        title="Excluir VLAN Equinix"
        message={<>Tem certeza que quer excluir <strong>{confirm.label}</strong>?</>}
        confirmLabel="Excluir"
        destructive
        loading={crud.remove.isPending}
        onConfirm={() => crud.remove.mutate(confirm.id, {
          onSuccess: () => setConfirm({ open: false, id: null, label: '' }),
        })}
      />
    </div>
  );
}

function Azure({ canEdit }) {
  const crud = useCrud({
    key: 'azure-subnets',
    list: api.azureSubnets,
    create: api.createAzureSubnet,
    update: api.updateAzureSubnet,
    remove: api.deleteAzureSubnet,
  });
  const [modal, setModal] = useState({ open: false, initial: null });
  const [confirm, setConfirm] = useState({ open: false, id: null, label: '' });
  const [err, setErr] = useState(null);

  return (
    <div>
      <Toolbar canEdit={canEdit} label="Nova Azure subnet" onNew={() => { setErr(null); setModal({ open: true, initial: null }); }} />
      <div className="card overflow-hidden">
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Network</th>
              <th className="px-3 py-2 text-left">Range</th>
              <th className="px-3 py-2 text-left">Broadcast</th>
              {canEdit && <th className="px-3 py-2 w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {crud.data.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.network || '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.usage || '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.broadcast || '—'}</td>
                <ActionCell
                  canEdit={canEdit}
                  onEdit={() => { setErr(null); setModal({ open: true, initial: r }); }}
                  onDelete={() => setConfirm({ open: true, id: r.id, label: r.name })}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CatalogFormModal
        open={modal.open}
        onClose={() => setModal({ open: false, initial: null })}
        title={modal.initial ? 'Editar Azure subnet' : 'Nova Azure subnet'}
        fields={AZURE_FIELDS}
        initial={modal.initial}
        loading={crud.create.isPending || crud.update.isPending}
        error={err}
        onSubmit={(data) => {
          if (modal.initial) {
            crud.update.mutate({ id: modal.initial.id, data }, {
              onSuccess: () => setModal({ open: false, initial: null }),
              onError: (e) => setErr(e.message),
            });
          } else {
            crud.create.mutate(data, {
              onSuccess: () => setModal({ open: false, initial: null }),
              onError: (e) => setErr(e.message),
            });
          }
        }}
      />
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null, label: '' })}
        title="Excluir Azure subnet"
        message={<>Tem certeza que quer excluir <strong>{confirm.label}</strong>?</>}
        confirmLabel="Excluir"
        destructive
        loading={crud.remove.isPending}
        onConfirm={() => crud.remove.mutate(confirm.id, {
          onSuccess: () => setConfirm({ open: false, id: null, label: '' }),
        })}
      />
    </div>
  );
}
