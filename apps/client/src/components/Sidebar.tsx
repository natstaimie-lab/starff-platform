'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import * as Ic from './icons';

type Item = { key: string; label: string; href: string; icon: ReactNode };
type Section = { label?: string; items: Item[] };

const sections: Section[] = [
  {
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <Ic.Grid /> },
      { key: 'onboarding', label: 'Complete Onboarding', href: '/dashboard/onboarding', icon: <Ic.ClipboardCheck /> },
    ],
  },
  {
    label: 'Staffing',
    items: [
      { key: 'book', label: 'Book Staff', href: '/dashboard/book', icon: <Ic.Plus /> },
      { key: 'bookings', label: 'My Bookings', href: '/dashboard/bookings', icon: <Ic.Calendar /> },
      { key: 'submissions', label: 'Review Candidates', href: '/dashboard/submissions', icon: <Ic.Users /> },
      { key: 'workers', label: 'Assigned Workers', href: '/dashboard/workers', icon: <Ic.HardHat /> },
      { key: 'timesheets', label: 'Timesheets', href: '/dashboard/timesheets', icon: <Ic.Clock /> },
    ],
  },
  {
    label: 'Billing',
    items: [
      { key: 'invoices', label: 'Invoices', href: '/dashboard/invoices', icon: <Ic.Receipt /> },
      { key: 'reports', label: 'Spend Reports', href: '/dashboard/reports', icon: <Ic.BarChart /> },
    ],
  },
  {
    label: 'My Company',
    items: [
      { key: 'company', label: 'Company Setup', href: '/dashboard/company', icon: <Ic.Building /> },
      { key: 'locations', label: 'Locations', href: '/dashboard/locations', icon: <Ic.MapPin /> },
      { key: 'messages', label: 'Messages', href: '/dashboard/messages', icon: <Ic.Message /> },
      { key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: <Ic.Settings /> },
      { key: 'help', label: 'Help & Support', href: '/dashboard/help', icon: <Ic.Headset /> },
    ],
  },
];

type Sub = { status: string };
type Job = { status: string; reviewNote?: string | null };
type Overview = { timesheetsPending?: number };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // Live "needs attention" counts for the menu badges.
  const [badges, setBadges] = useState<Record<string, number>>({});
  // Mobile: the sidebar becomes an off-canvas drawer toggled by a hamburger.
  const [open, setOpen] = useState(false);
  // Close the drawer whenever the route changes (i.e. after tapping a link).
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    Promise.all([
      apiFetch<Sub[]>('/client/submissions').catch(() => []),
      apiFetch<Job[]>('/client/jobs').catch(() => []),
      apiFetch<Overview>('/client/overview').catch(() => null),
    ]).then(([subs, jobs, ov]) => {
      const toReview = (subs ?? []).filter((s) => s.status === 'SUBMITTED_TO_CLIENT').length;
      const needInfo = (jobs ?? []).filter((j) => j.status === 'UNDER_REVIEW' && j.reviewNote).length;
      setBadges({ submissions: toReview, bookings: needInfo, timesheets: ov?.timesheetsPending ?? 0 });
    });
  }, [pathname]);

  const isActive = (href: string) => (href === '/dashboard' ? pathname === '/dashboard' : (pathname === href || pathname.startsWith(href + '/')));

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <>
      {/* Mobile-only hamburger (hidden on desktop via CSS). */}
      <button className="sb-toggle" aria-label="Open menu" onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      {/* Backdrop shown only while the drawer is open on mobile. */}
      {open && <div className="sb-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sb-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/starff-white.png" alt="Starff" style={{ height: 34, width: 'auto', display: 'block' }} />
        <div className="sb-sub">CLIENT PORTAL</div>
      </div>
      <nav className="sb-nav">
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.label && <div className="sb-section">{sec.label}</div>}
            {sec.items.map((it) => (
              <Link key={it.key} href={it.href} className={`sb-item ${isActive(it.href) ? 'on' : ''}`}>
                <span className="sb-ic">{it.icon}</span>
                {it.label}
                {badges[it.key] ? <span className="sb-badge">{badges[it.key]}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <button className="sb-item" onClick={signOut}>
          <span className="sb-ic"><Ic.LogOut /></span>
          Logout
        </button>
      </div>
      </aside>
    </>
  );
}
