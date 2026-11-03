/** Small display helpers shared by the staff screens. */
export function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'S'
  );
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function timeOf(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "14:05" today, "3 Nov" otherwise. */
export function relativeStamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() ? timeOf(iso) : shortDate(iso);
}

export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}
