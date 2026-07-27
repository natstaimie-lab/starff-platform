'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import * as Ic from '@/components/icons';

type Msg = { role: 'user' | 'assistant'; content: string };

const PROMPTS = [
  "Summarise today's operations",
  'Which timesheets need approving?',
  'Any compliance risks I should know about?',
  'Which candidates suit our open bookings?',
];

export default function AiAssistant() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "Hi — I'm your Starff assistant. Ask me about candidates, compliance, bookings, timesheets or finance and I'll answer from your live data." },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    const history = messages.filter((m) => m.role !== 'assistant' || messages.indexOf(m) > 0); // drop the greeting from context
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setDraft('');
    setSending(true);
    try {
      const res = await apiFetch<{ reply: string }>('/ai/ask', { method: 'POST', body: JSON.stringify({ message, history }) });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', minHeight: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--orange-100)', color: 'var(--orange-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.Sparkle width={18} /></span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Starff AI Assistant</div>
          <div className="sub2">Answers from your live data · suggest-only, you take every action</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-app)' }}>
        {messages.map((m, i) => {
          const mine = m.role === 'user';
          return (
            <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '11px 14px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: mine ? 'var(--blue-500)' : 'var(--surface-card)', color: mine ? '#fff' : 'var(--text-primary)', border: mine ? 'none' : '1px solid var(--border-subtle)', borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4 }}>
              {m.content}
            </div>
          );
        })}
        {sending && <div style={{ alignSelf: 'flex-start', color: 'var(--text-tertiary)', fontSize: 13 }}>Thinking…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
        {messages.length <= 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingBottom: 10 }}>
            {PROMPTS.map((p) => (
              <button key={p} onClick={() => send(p)} disabled={sending} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{p}</button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(draft); }} style={{ display: 'flex', gap: 10 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the assistant anything…" style={{ flex: 1, height: 42, padding: '0 14px', border: '1px solid var(--border-strong)', borderRadius: 999, fontSize: 14, outline: 'none' }} />
          <button className="aibtn" disabled={sending} style={{ background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 999 }}>Send</button>
        </form>
        <div className="sub2" style={{ textAlign: 'center', marginTop: 8 }}>Starff AI can make mistakes — review before acting.</div>
      </div>
    </div>
  );
}
