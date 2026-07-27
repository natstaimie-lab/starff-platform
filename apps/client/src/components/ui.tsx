import type { ReactNode } from 'react';

// ---------- Card ----------
export function Card({
  title,
  subtitle,
  action,
  children,
  bodyClass = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClass?: string;
}) {
  return (
    <div className="card">
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="sub2" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </div>
  );
}

// ---------- KPI stat ----------
export function KPIStat({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  tone = 'info',
}: {
  label: string;
  value: string;
  delta?: string;
  deltaLabel?: string;
  icon: ReactNode;
  tone?: 'info' | 'accent' | 'success';
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        <span className={`kpi-ic tone-${tone}`}>{icon}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {delta && (
        <div className="kpi-delta">
          ▲ {delta} <span className="dim" style={{ fontWeight: 500 }}>{deltaLabel ?? 'vs last 30 days'}</span>
        </div>
      )}
    </div>
  );
}

// ---------- Badge ----------
type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

// Compliance status → badge
const complianceMap: Record<string, { tone: Tone; label: string }> = {
  compliant: { tone: 'success', label: 'Compliant' },
  pending: { tone: 'warning', label: 'Pending' },
  expiring: { tone: 'warning', label: 'Expiring' },
  missing: { tone: 'error', label: 'Missing' },
  expired: { tone: 'error', label: 'Expired' },
};
export function ComplianceBadge({ status }: { status: string }) {
  const m = complianceMap[status] ?? { tone: 'neutral' as Tone, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

// ---------- Avatar (initials) ----------
function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

// ---------- DataTable ----------
export type Column<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
};
export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left' }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
