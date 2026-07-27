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
