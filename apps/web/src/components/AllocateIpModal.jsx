import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

const DEVICE_TYPES = [
  'Servidor Linux',
  'Servidor Windows',
  'Switch',
  'Roteador',
  'Firewall',
  'Storage',
  'Workstation',
  'Impressora',
  'VIP',
  'Outro',
];

export default function AllocateIpModal({ open, onClose, onSubmit, ip, loading, error }) {
  const [mode, setMode] = useState('new'); // 'new' | 'existing'
  const [form, setForm] = useState({
    deviceId: '',
    name: '',
    type: '',
    typeOther: '',
    vendor: '',
    model: '',
    serial: '',
    osInfo: '',
    role: '',
    ownerEmail: '',
    hostname: '',
    function: '',
    notes: '',
    macAddress: '',
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setMode('new');
      setSearch('');
      setForm({
        deviceId: '',
        name: '',
        type: '',
        typeOther: '',
        vendor: '',
        model: '',
        serial: '',
        osInfo: '',
        role: '',
        ownerEmail: '',
        hostname: '',
        function: '',
        notes: '',
        macAddress: '',
      });
    }
  }, [open]);

  // Lista de devices (sob demanda — só carrega quando modal aberto)
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', 'all'],
    queryFn: () => api.devices(),
    enabled: open,
    staleTime: 30_000,
  });

  const filteredDevices = useMemo(() => {
    if (!search.trim()) return devices.slice(0, 30);
    const s = search.toLowerCase();
    return devices
      .filter(
        (d) =>
          d.name?.toLowerCase().includes(s) ||
          d.type?.toLowerCase().includes(s) ||
          d.vendor?.toLowerCase().includes(s) ||
          d.model?.toLowerCase().includes(s),
      )
      .slice(0, 30);
  }, [devices, search]);

  const selectedDevice = useMemo(
    () => devices.find((d) => String(d.id) === String(form.deviceId)),
    [devices, form.deviceId],
  );

  function pickDevice(d) {
    setForm((f) => ({
      ...f,
      deviceId: String(d.id),
      hostname: f.hostname || d.name || '',
      function: f.function || d.role || '',
    }));
  }

  function submit(e) {
    e.preventDefault();
    let payload;
    if (mode === 'existing') {
      if (!form.deviceId) return;
      payload = {
        device: { id: Number(form.deviceId) },
        hostname: form.hostname.trim() || null,
        function: form.function.trim() || null,
        notes: form.notes.trim() || null,
        macAddress: form.macAddress.trim() || null,
      };
    } else {
      const name = form.name.trim();
      if (!name) return;
      const finalType =
        form.type === 'Outro' ? form.typeOther.trim() || null : form.type || null;
      payload = {
        device: {
          name,
          type: finalType,
          vendor: form.vendor.trim() || null,
          model: form.model.trim() || null,
          serial: form.serial.trim() || null,
          osInfo: form.osInfo.trim() || null,
          role: form.role.trim() || null,
          ownerEmail: form.ownerEmail.trim() || null,
        },
        hostname: form.hostname.trim() || name,
        function: form.function.trim() || form.role.trim() || null,
        notes: form.notes.trim() || null,
        macAddress: form.macAddress.trim() || null,
      };
    }
    onSubmit(payload);
  }

  const canSubmit =
    mode === 'existing' ? !!form.deviceId : !!form.name.trim();

  return (
    <Modal open={open} onClose={onClose} title={`Alocar IP ${ip?.address || ''}`} size="xl">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 p-2 rounded">
            {error}
          </div>
        )}

        {/* Endereço */}
        <div>
          <label className="block text-sm mb-1 text-slate-600 dark:text-slate-400">Endereço</label>
          <input
            value={ip?.address || ''}
            readOnly
            className="input font-mono bg-slate-50 dark:bg-slate-800 cursor-default"
          />
        </div>

        {/* Toggle */}
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`text-xs px-3 py-1.5 rounded ${
              mode === 'new'
                ? 'bg-white dark:bg-slate-900 shadow-sm font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Novo equipamento
          </button>
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`text-xs px-3 py-1.5 rounded ${
              mode === 'existing'
                ? 'bg-white dark:bg-slate-900 shadow-sm font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Vincular equipamento existente
          </button>
        </div>

        {mode === 'new' ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm mb-1">
                Nome / Hostname canônico <span className="text-rose-500">*</span>
              </label>
              <input
                required
                autoFocus
                placeholder="ex: srv-prod-01"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input"
              >
                <option value="">— selecione —</option>
                {DEVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {form.type === 'Outro' && (
                <input
                  placeholder="digite o tipo"
                  value={form.typeOther}
                  onChange={(e) => setForm({ ...form, typeOther: e.target.value })}
                  className="input mt-1"
                />
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Função / Papel</label>
              <input
                placeholder="ex: Web Server, Gateway"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Vendor</label>
              <input
                placeholder="ex: Dell, Cisco"
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Modelo</label>
              <input
                placeholder="ex: PowerEdge R740"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Serial</label>
              <input
                value={form.serial}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Sistema operacional</label>
              <input
                placeholder="ex: Ubuntu 22.04"
                value={form.osInfo}
                onChange={(e) => setForm({ ...form, osInfo: e.target.value })}
                className="input"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm mb-1">Email do responsável</label>
              <input
                type="email"
                placeholder="dono@bagre.com.br"
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                className="input"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm">
              Equipamento existente <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                placeholder="Buscar por nome, tipo, vendor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
              />
            </div>
            <div className="border rounded-md max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDevices.length === 0 && (
                <div className="px-3 py-4 text-sm text-slate-500 text-center">
                  Nenhum equipamento encontrado.
                </div>
              )}
              {filteredDevices.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => pickDevice(d)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    String(form.deviceId) === String(d.id)
                      ? 'bg-brand-50 dark:bg-brand-900/30'
                      : ''
                  }`}
                >
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-slate-500">
                    {d.type || '—'}
                    {d.vendor && ` · ${d.vendor}`}
                    {d.model && ` ${d.model}`}
                    {d._count?.ips != null && ` · ${d._count.ips} IP(s)`}
                  </div>
                </button>
              ))}
            </div>
            {selectedDevice && (
              <div className="text-xs text-emerald-700 dark:text-emerald-400">
                ✓ Selecionado: <strong>{selectedDevice.name}</strong>
              </div>
            )}
          </div>
        )}

        {/* Campos do IP */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="col-span-2 text-xs text-slate-500 -mb-1">Campos do IP (opcionais)</div>
          <div>
            <label className="block text-sm mb-1">Hostname (no IP)</label>
            <input
              placeholder={selectedDevice?.name || form.name || 'usa nome do equipamento'}
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Função (no IP)</label>
            <input
              placeholder={selectedDevice?.role || form.role || 'opcional'}
              value={form.function}
              onChange={(e) => setForm({ ...form, function: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">MAC Address</label>
            <input
              placeholder="AA:BB:CC:DD:EE:FF"
              value={form.macAddress}
              onChange={(e) => setForm({ ...form, macAddress: e.target.value })}
              className="input font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Notas</label>
            <input
              placeholder="opcional"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button className="btn-primary" disabled={loading || !canSubmit}>
            {loading ? 'Alocando…' : 'Alocar IP'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
