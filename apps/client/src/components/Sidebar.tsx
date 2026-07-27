'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import * as Ic from './icons';

type Item = { key: string; label: string; href: string; icon: ReactNode; badge?: number };
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href));

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <aside className="sidebar">
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
                {it.badge ? <span className="sb-badge">{it.badge}</span> : null}
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
  );
}
