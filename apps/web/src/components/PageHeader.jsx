export default function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="text-xs text-slate-400 mb-1">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
