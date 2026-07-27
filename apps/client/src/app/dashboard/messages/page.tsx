'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Msg = { id: string; senderIsStaff: boolean; senderName: string; body: string; createdAt: string };
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () => apiFetch<{ messages: Msg[] }>('/messages/thread').then((t) => setMsgs(t.messages)).catch(() => {});
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true); setDraft('');
    try { await apiFetch('/messages/thread', { method: 'POST', body: JSON.stringify({ body }) }); await load(); }
    finally { setSending(false); }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', minHeight: 480 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700 }}>Your Starff consultant</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-app)' }}>
        {msgs.map((m) => {
          const mine = !m.senderIsStaff;
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
              <div style={{ padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, background: mine ? 'var(--blue-500)' : 'var(--surface-card)', color: mine ? '#fff' : 'var(--text-primary)', border: mine ? 'none' : '1px solid var(--border-subtle)', borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4 }}>{m.body}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? 'You' : m.senderName} · {time(m.createdAt)}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" style={{ flex: 1, height: 42, padding: '0 14px', border: '1px solid var(--border-strong)', borderRadius: 999, fontSize: 14, outline: 'none' }} />
        <button className="btn-primary" disabled={sending} style={{ borderRadius: 999 }}>Send</button>
      </form>
    </div>
  );
}
