'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Avatar } from '@/components/ui';

type Convo = { id: string; kind: string; name: string; lastMessage: string; lastAt: string; unread: number };
type Msg = { id: string; senderIsStaff: boolean; senderName: string; body: string; createdAt: string };
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function AdminMessages() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ name: string; messages: Msg[] } | null>(null);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadConvos = () => apiFetch<Convo[]>('/messages/conversations').then((c) => {
    setConvos(c);
    setActiveId((id) => id ?? c[0]?.id ?? null);
  }).catch(() => {});
  const loadThread = (id: string) => apiFetch<{ name: string; messages: Msg[] }>(`/messages/conversations/${id}`).then(setThread).catch(() => {});

  useEffect(() => { loadConvos(); const i = setInterval(loadConvos, 5000); return () => clearInterval(i); }, []);
  useEffect(() => { if (activeId) loadThread(activeId); }, [activeId]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [thread?.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !activeId) return;
    setDraft('');
    await apiFetch(`/messages/conversations/${activeId}`, { method: 'POST', body: JSON.stringify({ body }) });
    loadThread(activeId); loadConvos();
  }

  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 150px)', minHeight: 480, overflow: 'hidden' }}>
      {/* conversation list */}
      <div style={{ borderRight: '1px solid var(--border-subtle)', overflowY: 'auto' }}>
        {convos.length === 0 && <p className="dim" style={{ padding: 16, fontSize: 13 }}>No conversations yet. Candidates and clients start threads from their portals.</p>}
        {convos.map((c) => (
          <button key={c.id} onClick={() => setActiveId(c.id)} style={{ display: 'flex', gap: 11, alignItems: 'center', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border-subtle)', background: activeId === c.id ? 'var(--orange-100)' : 'transparent', cursor: 'pointer' }}>
            <Avatar name={c.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fx ac jb"><span className="nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>{c.unread > 0 && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--orange-500)' }} />}</div>
              <div className="sub2" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage}</div>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: c.kind === 'CLIENT' ? 'var(--orange-600)' : 'var(--blue-500)' }}>{c.kind}</span>
            </div>
          </button>
        ))}
      </div>

      {/* thread */}
      {thread ? (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700 }}>{thread.name}</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-app)' }}>
            {thread.messages.map((m) => {
              const mine = m.senderIsStaff;
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '74%' }}>
                  <div style={{ padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, background: mine ? 'var(--blue-500)' : 'var(--surface-card)', color: mine ? '#fff' : 'var(--text-primary)', border: mine ? 'none' : '1px solid var(--border-subtle)' }}>{m.body}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? m.senderName : thread.name} · {time(m.createdAt)}</div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a reply…" style={{ flex: 1, height: 42, padding: '0 14px', border: '1px solid var(--border-strong)', borderRadius: 999, fontSize: 14, outline: 'none' }} />
            <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 999 }}>Send</button>
          </form>
        </div>
      ) : (
        <div className="fx ac" style={{ justifyContent: 'center', color: 'var(--text-tertiary)' }}>Select a conversation</div>
      )}
    </div>
  );
}
