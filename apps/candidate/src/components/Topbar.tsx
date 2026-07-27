'use client';

import { Avatar } from './ui';
import * as Ic from './icons';

export function Topbar({ name }: { name: string }) {
  return (
    <div className="phead" style={{ padding: '18px 28px', background: 'var(--surface-card)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div className="hello">Welcome back,</div>
        <div className="ptitle" style={{ fontSize: 24 }}>{name || 'Candidate'}</div>
      </div>
      <div className="fx ac gap10">
        <button className="iconbtn" aria-label="Notifications"><Ic.Bell /></button>
        <button className="iconbtn" aria-label="Messages"><Ic.Message /></button>
        <Avatar name={name || 'Candidate'} size={40} />
      </div>
    </div>
  );
}
