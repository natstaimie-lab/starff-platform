'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import * as Ic from './icons';

type Item = { key: string; label: string; href: string; icon: ReactNode };
type Section = { label?: string; items: Item[] };

// Menu grouping only — every href below is an existing route; no page,
// route or permission changes live here.
const sections: Section[] = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <Ic.Grid /> },
      { key: 'ai', label: 'AI Assistant', href: '/dashboard/ai', icon: <Ic.Sparkle /> },
      { key: 'messages', label: 'Messages', href: '/dashboard/messages', icon: <Ic.Message /> },
    ],
  },
  {
    label: 'Sales & CRM',
    items: [
      { key: 'followups', label: 'Follow-ups today', href: '/dashboard/leads/today', icon: <Ic.Bell /> },
      { key: 'pipeline', label: 'Pipeline', href: '/dashboard/leads/board', icon: <Ic.TrendUp /> },
      { key: 'leads', label: 'Leads', href: '/dashboard/leads', icon: <Ic.User /> },
      { key: 'suggested', label: 'Suggested leads', href: '/dashboard/leads/suggested', icon: <Ic.Search /> },
      { key: 'aiapprovals', label: 'AI approvals', href: '/dashboard/leads/approvals', icon: <Ic.Sparkle /> },
      { key: 'quotes', label: 'Quotes', href: '/dashboard/quotes', icon: <Ic.PoundSterling /> },
      { key: 'enquiries', label: 'Enquiries', href: '/dashboard/enquiries', icon: <Ic.FileText /> },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'bookings', label: 'Job Bookings', href: '/dashboard/bookings', icon: <Ic.Briefcase /> },
      { key: 'shifts', label: 'Shifts', href: '/dashboard/shifts', icon: <Ic.Calendar /> },
      { key: 'compliance', label: 'Compliance', href: '/dashboard/compliance', icon: <Ic.ClipboardCheck /> },
    ],
  },
  {
    label: 'People',
    items: [
      { key: 'candidates', label: 'Candidates', href: '/dashboard/candidates', icon: <Ic.Users /> },
      { key: 'workers', label: 'Workers', href: '/dashboard/workers', icon: <Ic.HardHat /> },
      { key: 'clients', label: 'Clients', href: '/dashboard/clients', icon: <Ic.Building /> },
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
    label: 'Settings',
    items: [
      { key: 'staff', label: 'Staff & Access', href: '/dashboard/staff', icon: <Ic.Shield /> },
      { key: 'deletions', label: 'Account deletions', href: '/dashboard/deletions', icon: <Ic.AlertCircle /> },
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
    const loadBadges = () => {
      apiFetch<{
        pendingTimesheets: number; complianceAttention: number; newEnquiries: number;
        unreadMessages: number; pendingDeletions: number; newCandidates: number;
        newClients: number; jobsAwaitingAdmin: number; openShifts: number; overdueInvoices: number;
      }>('/stats/overview')
        .then((s) => setBadges((b) => ({ ...b,
          candidates: s.newCandidates,
          clients: s.newClients,
          enquiries: s.newEnquiries,
          bookings: s.jobsAwaitingAdmin,
          shifts: s.openShifts,
          compliance: s.complianceAttention,
          deletions: s.pendingDeletions,
          timesheets: s.pendingTimesheets,
          payroll: s.overdueInvoices,
          messages: s.unreadMessages,
        })))
        .catch(() => {});
      // CRM follow-ups due today (UK) or overdue — separate call so a stats hiccup can't hide it.
      apiFetch<{ followUpsDue: number }>('/leads/summary')
        .then((s) => setBadges((b) => ({ ...b, followups: s.followUpsDue })))
        .catch(() => {});
      // AI salesperson drafts waiting for a decision.
      apiFetch<{ pending: number }>('/ai-sales/summary')
        .then((s) => setBadges((b) => ({ ...b, aiapprovals: s.pending })))
        .catch(() => {});
      // Apollo suggestions waiting for accept / reject.
      apiFetch<{ pending: number }>('/prospecting/summary')
        .then((s) => setBadges((b) => ({ ...b, suggested: s.pending })))
        .catch(() => {});
    };
    loadBadges();
    // Refresh the counts periodically so new items show up without a reload.
    const t = setInterval(loadBadges, 30000);
    return () => clearInterval(t);
  }, [pathname]);

  // Highlight the most specific match, so /dashboard/leads/today lights up
  // "Follow-ups today" and not "Leads" as well.
  const matches = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : (pathname === href || pathname.startsWith(href + '/'));
  const activeHref = sections.flatMap((s) => s.items.map((i) => i.href)).filter(matches).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

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
