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
  { items: [{ key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <Ic.Grid /> }] },
  {
    label: 'People',
    items: [
      { key: 'candidates', label: 'Candidates', href: '/dashboard/candidates', icon: <Ic.Users /> },
      { key: 'workers', label: 'Workers', href: '/dashboard/workers', icon: <Ic.HardHat /> },
      { key: 'clients', label: 'Clients', href: '/dashboard/clients', icon: <Ic.Building /> },
      { key: 'enquiries', label: 'Enquiries', href: '/dashboard/enquiries', icon: <Ic.FileText /> },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'bookings', label: 'Job Bookings', href: '/dashboard/bookings', icon: <Ic.Briefcase /> },
      { key: 'shifts', label: 'Shifts', href: '/dashboard/shifts', icon: <Ic.Calendar /> },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { key: 'compliance', label: 'Compliance', href: '/dashboard/compliance', icon: <Ic.ClipboardCheck /> },
    ],
  },
  {
    label: 'Finance',
    items: [
      { key: 'timesheets', label: 'Timesheets', href: '/dashboard/timesheets', icon: <Ic.Clock /> },
      { key: 'payroll', label: 'Payroll & Invoices', href: '/dashboard/payroll', icon: <Ic.Receipt /> },
    ],
  },
  {
    label: 'Insights',
    items: [
      { key: 'ai', label: 'AI Assistant', href: '/dashboard/ai', icon: <Ic.Sparkle /> },
      { key: 'messages', label: 'Messages', href: '/dashboard/messages', icon: <Ic.Message /> },
    ],
  },
  {
    items: [
      { key: 'staff', label: 'Staff & Access', href: '/dashboard/staff', icon: <Ic.Shield /> },
      { key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: <Ic.Settings /> },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // Live badge counts — timesheets awaiting approval, candidates needing a
  // compliance decision. Replaces the old hardcoded 42 / 34.
  const [badges, setBadges] = useState<Record<string, number>>({});
  // Mobile: the sidebar becomes an off-canvas drawer toggled by a hamburger.
  const [open, setOpen] = useState(false);
  // Close the drawer whenever the route changes (i.e. after tapping a link).
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    apiFetch<{ pendingTimesheets: number; complianceAttention: number; newEnquiries: number }>('/stats/overview')
      .then((s) => setBadges({ timesheets: s.pendingTimesheets, compliance: s.complianceAttention, enquiries: s.newEnquiries }))
      .catch(() => {});
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : (pathname === href || pathname.startsWith(href + '/'));

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
        <div className="sb-sub">ADMIN DASHBOARD</div>
      </div>
      <nav className="sb-nav">
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.label && <div className="sb-section">{sec.label}</div>}
            {sec.items.map((it) => (
              <Link
                key={it.key}
                href={it.href}
                className={`sb-item ${isActive(it.href) ? 'on' : ''}`}
              >
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
