export const ADMIN_DASHBOARD_URL = 'https://admin.starff.co.uk';

export function fullName(p: { firstName?: string | null; lastName?: string | null }) {
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Unnamed';
}
export function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'W';
}
export function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
}
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
