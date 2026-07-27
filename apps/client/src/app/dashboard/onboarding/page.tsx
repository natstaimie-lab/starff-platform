'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Section = { key: string; label: string; done: boolean };
type Progress = {
  percent: number;
  complete: boolean;
  submitted: boolean;
  status: string;
  sections: Section[];
  nextSection: string | null;
};

const META: Record<string, { href: string; hint: string; icon: ReactNode }> = {
  company: { href: '/dashboard/company', hint: 'Industry and company registration number', icon: <Ic.Building width={17} /> },
  address: { href: '/dashboard/company', hint: 'Your registered business address', icon: <Ic.MapPin width={17} /> },
  billing: { href: '/dashboard/company', hint: 'Billing email and payment terms', icon: <Ic.Receipt width={17} /> },
  sites: { href: '/dashboard/company', hint: 'Add at least one hiring location', icon: <Ic.MapPin width={17} /> },
  agreement: { href: '/dashboard/company', hint: 'Accept the terms and sign', icon: <Ic.ClipboardCheck width={17} /> },
};

export default function ClientOnboardingPage() {
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    apiFetch<Progress>('/registration/client/progress')
      .then(setP)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch('/registration/client/submit', { method: 'POST' });
      await load();
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (loading) return <p className="dim">Loading your onboarding…</p>;
  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!p) return null;

  const remaining = p.sections.filter((s) => !s.done).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <ProgressRing percent={p.percent} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Complete your onboarding</div>
            <div className="dim" style={{ fontSize: 14, marginTop: 2 }}>
              {p.submitted
                ? 'Your onboarding is with our team for review.'
                : p.complete
                  ? 'Everything’s done — submit for review when you’re ready.'
                  : `${remaining} section${remaining === 1 ? '' : 's'} left before you can submit.`}
            </div>
          </div>
        </div>
      </div>

      {p.submitted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--success-100, #e7f4ee)', border: '1px solid var(--success-500)' }}>
          <span style={{ color: 'var(--success-600, #15805a)' }}><Ic.Check width={20} /></span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--success-600, #15805a)' }}>Submitted for review</div>
            <div className="dim" style={{ fontSize: 13 }}>Our team will confirm your account shortly. You can still update your details below.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><div className="card-title">Onboarding checklist</div></div>
        <div className="card-body" style={{ padding: 0 }}>
          {p.sections.map((s, i) => {
            const meta = META[s.key];
            const isNext = !s.done && p.nextSection === s.key;
            return (
              <Link
                key={s.key}
                href={meta?.href ?? '#'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', textDecoration: 'none',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                  background: isNext ? 'var(--orange-100, #fdf0e6)' : 'transparent',
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.done ? 'var(--success-500)' : 'var(--surface-sunken, #eef1f6)',
                  color: s.done ? '#fff' : 'var(--text-tertiary)',
                  border: s.done ? 'none' : '1px solid var(--border-strong, #d5dce6)',
                }}>
                  {s.done ? <Ic.Check width={15} /> : meta?.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>{s.label}</div>
                  <div className="dim" style={{ fontSize: 12.5 }}>{meta?.hint}</div>
                </div>
                {s.done
                  ? <Badge tone="success">Done</Badge>
                  : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-link)', fontSize: 13, fontWeight: 700 }}>{isNext ? 'Start' : 'Add'} <span aria-hidden>→</span></span>}
              </Link>
            );
          })}
        </div>
      </div>

      {!p.submitted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={submit}
            disabled={!p.complete || submitting}
            className="aibtn"
            style={{
              background: p.complete ? 'var(--blue-500)' : 'var(--surface-sunken, #eef1f6)',
              color: p.complete ? '#fff' : 'var(--text-tertiary)',
              border: 'none', cursor: p.complete ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit onboarding for review'}
          </button>
          {!p.complete && <span className="dim" style={{ fontSize: 13 }}>Complete every section to submit.</span>}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 74, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken, #eef1f6)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--orange-500)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={17} fontWeight={800} fill="var(--text-primary)">{percent}%</text>
    </svg>
  );
}
