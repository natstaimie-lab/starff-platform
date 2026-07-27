// Lightweight hand-rolled SVG charts — no external chart library needed.

export type Segment = { label: string; value: number; color: string };

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 180,
  thickness = 26,
}: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="fx ac" style={{ gap: 20, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" fontSize={size * 0.16} fontWeight={800} fill="var(--text-primary)">
          {centerValue}
        </text>
        <text x="50%" y="60%" textAnchor="middle" fontSize={size * 0.075} fill="var(--text-secondary)">
          {centerLabel}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 150 }}>
        {segments.map((s, i) => (
          <div key={i} className="fx ac jb" style={{ padding: '7px 0' }}>
            <span className="legl">
              <span className="legdot" style={{ background: s.color }} />
              {s.label}
            </span>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type Series = { name: string; color: string; data: number[] };

export function AreaChart({
  labels,
  series,
  height = 200,
}: {
  labels: string[];
  series: Series[];
  height?: number;
}) {
  const w = 640;
  const h = height;
  const padT = 10;
  const padB = 6;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const n = labels.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);

  const linePath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const areaPath = (data: number[]) =>
    `${linePath(data)} L ${x(n - 1)} ${h} L ${x(0)} ${h} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      {/* preserveAspectRatio="none" fills the card box; non-scaling strokes stay crisp */}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {gridVals.map((g, i) => (
          <line key={i} x1={0} x2={w} y1={padT + g * (h - padT - padB)} y2={padT + g * (h - padT - padB)} stroke="var(--border-subtle)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => (
          <path key={`a${i}`} d={areaPath(s.data)} fill={`url(#grad${i})`} />
        ))}
        {series.map((s, i) => (
          <path key={`l${i}`} d={linePath(s.data)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {labels.map((lb, i) => (
          <span key={i} style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{lb}</span>
        ))}
      </div>
    </div>
  );
}
