'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Shift = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  job: { title: string; client: { name: string } };
  site?: { name: string };
  candidate?: { firstName: string; lastName: string };
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInPhotoUrl?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkInDistanceM?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutDistanceM?: number | null;
};

// Matches SITE_RADIUS_M in apps/api/src/me/site-distance.ts.
const SITE_RADIUS_M = 500;

/** One line per check-in / check-out: time, and how far the phone was from the site. */
function LocationLine({ label, at, lat, lng, dist }: { label: string; at?: string | null; lat?: number | null; lng?: number | null; dist?: number | null }) {
  if (!at) return null;
  const hasPos = typeof lat === 'number' && typeof lng === 'number';
  const far = typeof dist === 'number' && dist > SITE_RADIUS_M;
  const distText = typeof dist === 'number' ? (dist < 1000 ? `${dist} m from site` : `${(dist / 1000).toFixed(1)} km from site`) : hasPos ? 'site postcode unknown' : 'no location';
  return (
    <span className="fx ac" style={{ gap: 6, fontSize: 12.5 }}>
      <b style={{ fontWeight: 600 }}>{label} {hhmm(at)}</b>
      <Badge tone={(far || !hasPos ? 'warning' : 'success') as any}>{distText}</Badge>
      {hasPos && (
        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--orange-600)', fontWeight: 600 }}>Map</a>
      )}
    </span>
  );
}

type CheckInPhoto = {
  checkedInAt: string | null;
  checkInPhotoUrl: string | null;
  identitySelfieUrl: string | null;
  identitySelfieVerified: boolean;
};

/** Clock-in selfie next to the worker's identity selfie, so staff can compare them. */
function CheckInPhotoPanel({ shiftId }: { shiftId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CheckInPhoto | null>(null);
  const [err, setErr] = useState('');

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Signed links expire after 5 minutes, so fetch fresh each time it opens.
    if (next) {
      setData(null); setErr('');
      apiFetch<CheckInPhoto>(`/shifts/${shiftId}/check-in-photo`).then(setData).catch((e) => setErr(e.message));
    }
  };

  const img = (url: string | null, label: string, note?: string) => (
    <figure style={{ margin: 0, flex: 1, minWidth: 0 }}>
      <div style={{ aspectRatio: '3 / 4', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url ? <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="dim" style={{ fontSize: 12 }}>Not available</span>}
      </div>
      <figcaption style={{ fontSize: 12, marginTop: 6, fontWeight: 600 }}>{label}{note ? <span className="dim" style={{ fontWeight: 400 }}> · {note}</span> : null}</figcaption>
    </figure>
  );

  return (
    <div>
      <button onClick={toggle} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--orange-600)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {open ? 'Hide check-in photo' : 'View check-in photo'}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {err ? <p style={{ color: 'var(--error-600)', fontSize: 12.5 }}>{err}</p>
            : !data ? <p className="dim" style={{ fontSize: 12.5 }}>Loading…</p>
            : (
              <div style={{ display: 'flex', gap: 12 }}>
                {img(data.checkInPhotoUrl, 'At check-in', data.checkedInAt ? hhmm(data.checkedInAt) : undefined)}
                {img(data.identitySelfieUrl, 'Identity selfie', data.identitySelfieUrl ? (data.identitySelfieVerified ? 'verified' : 'not yet verified') : undefined)}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

const tone: Record<string, string> = {
  OPEN: 'warning', ASSIGNED: 'info', CONFIRMED: 'success', IN_PROGRESS: 'info',
  COMPLETED: 'success', CANCELLED: 'error', NO_SHOW: 'error',
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function ShiftCard({ s }: { s: Shift }) {
  const d = new Date(s.startAt);
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="fx jb ac">
        <div className="fx ac" style={{ gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--orange-100)', color: 'var(--orange-600)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <b style={{ fontSize: 19, lineHeight: 1 }}>{d.getDate()}</b>
            <span style={{ fontSize: 10, fontWeight: 700 }}>{MONTHS[d.getMonth()]}</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{s.job.title}</div>
            <div className="dim" style={{ fontSize: 13 }}>{s.site?.name ?? s.job.client.name}</div>
          </div>
        </div>
        <Badge tone={(tone[s.status] ?? 'neutral') as any}>{s.status}</Badge>
      </div>
      <div className="smeta" style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--text-secondary)' }}>
        <span className="fx ac" style={{ gap: 5 }}><Ic.Clock width={15} /> {hhmm(s.startAt)}–{hhmm(s.endAt)}</span>
        <span className="fx ac" style={{ gap: 5 }}><Ic.HardHat width={15} /> {s.candidate ? `${s.candidate.firstName} ${s.candidate.lastName}` : 'Unassigned'}</span>
        <span className="fx ac" style={{ gap: 5 }}><Ic.Building width={15} /> {s.job.client.name}</span>
      </div>
      {s.checkInAt ? (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <LocationLine label="In" at={s.checkInAt} lat={s.checkInLat} lng={s.checkInLng} dist={s.checkInDistanceM} />
          <LocationLine label="Out" at={s.checkOutAt} lat={s.checkOutLat} lng={s.checkOutLng} dist={s.checkOutDistanceM} />
        </div>
      ) : null}
      {s.checkInPhotoUrl ? <CheckInPhotoPanel shiftId={s.id} /> : null}
    </div>
  );
}

const PAGE_SIZE = 12;

export default function ShiftsPage() {
  const [rows, setRows] = useState<Shift[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    apiFetch<Shift[]>('/shifts').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (loading) return <p className="dim">Loading…</p>;
  if (!rows.length) return <p className="dim">No shifts scheduled yet.</p>;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const paged = rows.length > PAGE_SIZE;
  const start = current * PAGE_SIZE;
  const visible = paged ? rows.slice(start, start + PAGE_SIZE) : rows;
  const pagerBtn = (disabled: boolean): React.CSSProperties => ({
    height: 30, padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)', opacity: disabled ? 0.6 : 1,
  });

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        {visible.map((s) => <ShiftCard key={s.id} s={s} />)}
      </div>
      {paged && (
        <div className="fx ac jb" style={{ marginTop: 16 }}>
          <span className="dim" style={{ fontSize: 12.5 }}>Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length} shifts</span>
          <div className="fx ac" style={{ gap: 8 }}>
            <button onClick={() => setPage(current - 1)} disabled={current === 0} style={pagerBtn(current === 0)}>← Prev</button>
            <span className="dim" style={{ fontSize: 12.5 }}>Page {current + 1} / {pageCount}</span>
            <button onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1} style={pagerBtn(current >= pageCount - 1)}>Next →</button>
          </div>
        </div>
      )}
    </>
  );
}
