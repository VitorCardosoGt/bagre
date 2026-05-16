const LABEL = {
  FREE: 'Livre',
  USED: 'Em uso',
  RESERVED: 'Reservado',
  CONFLICT: 'Conflito',
};
const CLASS = {
  FREE: 'badge-free',
  USED: 'badge-used',
  RESERVED: 'badge-rsv',
  CONFLICT: 'badge-conf',
};

export default function StatusBadge({ status = 'FREE' }) {
  return <span className={CLASS[status] || 'badge-free'}>{LABEL[status] || status}</span>;
}
