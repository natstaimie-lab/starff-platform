'use client';

import Link from 'next/link';
import { Avatar } from './ui';
import * as Ic from './icons';

export function Topbar({ company, contact }: { company: string; contact: string }) {
  return (
    <div className="phead" style={{ padding: '18px 28px', background: 'var(--surface-card)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div className="hello">My Company</div>
        <div className="ptitle" style={{ fontSize: 24 }}>{company || '—'}</div>
      </div>
      <div className="fx ac gap10">
        <Link href="/dashboard/book" className="btn-primary" style={{ textDecoration: 'none' }}><Ic.Plus width={16} /> Book Staff</Link>
        <button className="iconbtn" aria-label="Notifications"><Ic.Bell /></button>
        <Avatar name={contact || company || 'Client'} size={40} />
      </div>
    </div>
  );
}
