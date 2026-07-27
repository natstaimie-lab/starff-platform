'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Avatar } from './ui';
import * as Ic from './icons';

type Notif = { id: string; type: string; title: string; body?: string | null; link?: string | null; readAt?: string | null; createdAt: string };

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const load = () => apiFetch<Notif[]>('/notifications').then(setNotifs).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  const unread = notifs.filter((n) => !n.readAt).length;

  async function openNotif(n: Notif) {
    if (!n.readAt) { await apiFetch(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {}); load(); }
    if (n.link) window.location.href = n.link;
    else setOpen(false);
  }
  async function markAll() { await apiFetch('/notifications/read-all', { method: 'POST' }).catch(() => {}); load(); }

  return (
    <div style={{ position: 'relative' }}>
      <button className="iconbtn" aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
        <Ic.Bell />
        {unread > 0 && <span className="dot-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 344, maxHeight: 440, overflowY: 'auto', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: '0 14px 36px rgba(11,31,58,.18)', zIndex: 50 }}>
            <div className="fx ac jb" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--surface-card)' }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Notifications{unread > 0 ? ` (${unread})` : ''}</span>
              {unread > 0 && <button onClick={markAll} className="link" style={{ fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer' }}>Mark all read</button>}
            </div>
            {notifs.length === 0 ? (
              <p className="dim" style={{ padding: 22, fontSize: 13.5, textAlign: 'center' }}>No notifications yet.</p>
            ) : notifs.slice(0, 20).map((n) => (
              <button key={n.id} onClick={() => openNotif(n)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border-subtle)', background: n.readAt ? 'transparent' : 'var(--blue-100, #e7efff)', cursor: 'pointer' }}>
                <div className="fx ac" style={{ gap: 8 }}>
                  {!n.readAt && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--blue-500)', flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{n.title}</span>
                  <span className="dim" style={{ marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                </div>
                {n.body && <div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>{n.body}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar({ name }: { name: string }) {
  return (
    <div className="phead" style={{ padding: '18px 28px', background: 'var(--surface-card)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div className="hello">Welcome back,</div>
        <div className="ptitle" style={{ fontSize: 24 }}>{name || 'Candidate'}</div>
      </div>
      <div className="fx ac gap10">
        <NotificationBell />
        <button className="iconbtn" aria-label="Messages"><Ic.Message /></button>
        <Avatar name={name || 'Candidate'} size={40} />
      </div>
    </div>
  );
}
