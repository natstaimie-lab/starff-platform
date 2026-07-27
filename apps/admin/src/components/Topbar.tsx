'use client';

import Link from 'next/link';
import { Avatar } from './ui';
import * as Ic from './icons';

export function Topbar({
  title,
  subtitle,
  email,
}: {
  title: string;
  subtitle: string;
  email: string;
}) {
  return (
    <div className="phead">
      <div>
        <div className="ptitle">{title}</div>
        <div className="psub">{subtitle}</div>
      </div>
      <div className="fx ac gap10">
        <div className="searchbar">
          <Ic.Search width={18} height={18} />
          <input placeholder="Search candidates, clients, bookings…" />
        </div>
        <Link href="/dashboard/ai" className="aibtn" style={{ textDecoration: 'none' }}>
          <Ic.Sparkle width={18} height={18} /> AI Assistant
        </Link>
        <button className="iconbtn" aria-label="Notifications">
          <Ic.Bell />
          <span className="dot-badge">8</span>
        </button>
        <Avatar name={email || 'Admin User'} size={40} />
      </div>
    </div>
  );
}
