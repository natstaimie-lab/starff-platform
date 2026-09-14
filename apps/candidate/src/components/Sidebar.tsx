'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import { complianceChecks } from '@/lib/compliance';
import * as Ic from './icons';

type Item = { key: string; label: string; href: string; icon: ReactNode };
type Section = { label?: string; items: Item[] };

const sections: Section[] = [
  {
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <Ic.Grid /> },
      { key: 'onboarding', label: 'Complete Registration', href: '/dashboard/onboarding', icon: <Ic.ClipboardCheck /> },
    ],
  },
  {
    label: 'My Work',
    items: [
      { key: 'offers', label: 'Shift Offers', href: '/dashboard/offers', icon: <Ic.Sparkle /> },
      { key: 'bookings', label: 'My Bookings', href: '/dashboard/bookings', icon: <Ic.Briefcase /> },
      { key: 'availability', label: 'Availability', href: '/dashboard/availability', icon: <Ic.Calendar /> },
      { key: 'timesheets', label: 'Timesheets', href: '/dashboard/timesheets', icon: <Ic.Clock /> },
      { key: 'payments', label: 'Payments', href: '/dashboard/payments', icon: <Ic.PoundSterling /> },
    ],
  },
  {
    label: 'My Account',
    items: [
      { key: 'profile', label: 'My Profile', href: '/dashboard/profile', icon: <Ic.User /> },
      { key: 'work-history', label: 'Work History', href: '/dashboard/work-history', icon: <Ic.Briefcase /> },
      { key: 'documents', label: 'Documents', href: '/dashboard/documents', icon: <Ic.FileText /> },
      { key: 'declarations', label: 'Agreements', href: '/dashboard/declarations', icon: <Ic.ClipboardCheck /> },
      { key: 'compliance', label: 'Compliance', href: '/dashboard/compliance', icon: <Ic.Shield /> },
      { key: 'messages', label: 'Messages', href: '/dashboard/messages', icon: <Ic.Message /> },
      { key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: <Ic.Settings /> },
      { key: 'help', label: 'Help & Support', href: '/dashboard/help', icon: <Ic.Headset /> },
    ],
  },
];

type Doc = { type: string; status: string };
type Shift = { id: string; status: string; startAt: string; checkInAt?: string | null };
type Me = { status?: string; documents?: Doc[]; shifts?: Shift[]; timesheets?: { shiftId: string }[] };
type Inv = { status: string };

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
      apiFetch<Me>('/me').catch(() => null),
      apiFetch<Inv[]>('/me/invitations').catch(() => []),
    ]).then(([me, invs]) => {
      if (!me) return;
      const now = Date.now();
      const shifts = me.shifts ?? [];
      const submitted = new Set((me.timesheets ?? []).map((t) => t.shiftId));
      const offers = (invs ?? []).filter((i) => i.status === 'INVITED').length;
      const toAction = shifts.filter((s) => s.status === 'ASSIGNED' || s.status === 'IN_PROGRESS' || (s.status === 'CONFIRMED' && +new Date(s.startAt) <= now && !s.checkInAt)).length;
      const toSubmit = shifts.filter((s) => s.status === 'COMPLETED' && !submitted.has(s.id)).length;
      const { total, done, cleared } = complianceChecks(me.status, me.documents ?? []);
      setBadges({ offers, bookings: toAction, timesheets: toSubmit, compliance: cleared ? 0 : total - done });
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
        <div className="sb-sub">CANDIDATE PORTAL</div>
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
