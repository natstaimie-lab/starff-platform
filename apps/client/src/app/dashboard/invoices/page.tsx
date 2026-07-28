'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge, DataTable, type Column } from '@/components/ui';
import { Modal, Button } from '@/components/Modal';

type Inv = { id: string; number: string; total: string; status: string; periodEnd: string; dueDate?: string };
type Line = { id: string; description: string; hours: string; rate: string; amount: string };
type FullInv = Inv & { periodStart: string; subtotal: string; vat: string; lines: Line[] };

const tone: Record<string, string> = { PAID: 'success', SENT: 'info', OVERDUE: 'error', DRAFT: 'neutral', VOID: 'neutral' };
const gbp = (v: string | number) => '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function InvoicesPage() {
  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<FullInv | null>(null);
  const [contesting, setContesting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => apiFetch<Inv[]>('/client/invoices').then(setRows).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function open(id: string) {
    setContesting(false); setReason(''); setDone(false);
    try { setSel(await apiFetch<FullInv>(`/client/invoices/${id}`)); }
    catch (e: any) { alert(e.message); }
  }

  async function submitContest() {
    if (!sel) return;
    if (!reason.trim()) { alert('Please tell us what looks wrong so we can review it.'); return; }
    setBusy(true);
    try {
      await apiFetch(`/client/invoices/${sel.id}/contest`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setDone(true); setContesting(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  const cols: Column<Inv>[] = [
    { key: 'number', header: 'Invoice', render: (r) => <span className="mono">{r.number}</span> },
    { key: 'period', header: 'Period end', render: (r) => <span className="dim">{fmt(r.periodEnd)}</span> },
    { key: 'due', header: 'Due', render: (r) => <span className="dim">{fmt(r.dueDate)}</span> },
    { key: 'total', header: 'Amount', align: 'right', render: (r) => <span className="mono">{gbp(r.total)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
    { key: 'act', header: '', align: 'right', render: (r) => (
      <button onClick={() => open(r.id)} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer' }}>View</button>
    ) },
  ];

  const canContest = sel && (sel.status === 'SENT' || sel.status === 'OVERDUE');
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="fx jb" style={{ padding: '7px 0', fontSize: 13.5 }}><span className="dim">{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
  );

  return (
    <>
      <Card title="Invoices">
        {loading ? <p className="dim">Loading…</p> : rows.length === 0 ? <p className="dim">No invoices yet.</p> : <DataTable columns={cols} rows={rows} />}
      </Card>

      {sel && (
        <Modal
          title={`Invoice ${sel.number}`}
          subtitle={`${fmt(sel.periodStart)} – ${fmt(sel.periodEnd)}`}
          width={560}
          onClose={() => setSel(null)}
          footer={
            done ? <Button onClick={() => setSel(null)}>Close</Button>
            : contesting ? (
              <>
                <Button variant="outline" onClick={() => setContesting(false)} disabled={busy}>Back</Button>
                <Button onClick={submitContest} disabled={busy}>{busy ? 'Sending…' : 'Submit contest'}</Button>
              </>
            ) : (
              <>
                {canContest && <Button variant="outline" onClick={() => setContesting(true)}>Contest invoice</Button>}
                <Button onClick={() => setSel(null)}>Close</Button>
              </>
            )
          }
        >
          <div className="fx ac jb">
            <Badge tone={(tone[sel.status] ?? 'neutral') as any}>{sel.status}</Badge>
            <span className="dim" style={{ fontSize: 12.5 }}>Due {fmt(sel.dueDate)}</span>
          </div>

          {done ? (
            <div style={{ background: 'var(--success-100)', border: '1px solid var(--success-500)', borderRadius: 10, padding: 14, fontSize: 13.5 }}>
              ✓ Thanks — we&apos;ve flagged invoice <b>{sel.number}</b> to the Starff team. They&apos;ll review it and be in touch. The invoice is unchanged until they respond.
            </div>
          ) : contesting ? (
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>What looks wrong with this invoice?</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
                placeholder="e.g. The hours for Tuesday don't match the shift we booked — should be 8, not 10."
                style={{ width: '100%', minHeight: 96, padding: 11, border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }} />
              <span className="dim" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>This sends your query to Starff. The invoice isn&apos;t changed automatically — the team will review and respond.</span>
            </label>
          ) : (
            <>
              <div style={{ margin: '4px 0 2px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-secondary)' }}>Line items</div>
              <div className="fx" style={{ gap: 8, padding: '4px 0', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                <span style={{ flex: 1 }}>Description</span><span style={{ width: 44, textAlign: 'right' }}>Hrs</span><span style={{ width: 64, textAlign: 'right' }}>Rate</span><span style={{ width: 76, textAlign: 'right' }}>Amount</span>
              </div>
              {sel.lines.map((l) => (
                <div key={l.id} className="fx ac" style={{ gap: 8, padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: 12.5 }}>
                  <span style={{ flex: 1 }}>{l.description}</span>
                  <span className="mono" style={{ width: 44, textAlign: 'right' }}>{Number(l.hours)}</span>
                  <span className="mono" style={{ width: 64, textAlign: 'right' }}>{gbp(l.rate)}</span>
                  <span className="mono" style={{ width: 76, textAlign: 'right', fontWeight: 700 }}>{gbp(l.amount)}</span>
                </div>
              ))}
              <div style={{ marginTop: 10, borderTop: '2px solid var(--border-subtle)', paddingTop: 8 }}>
                <Row k="Subtotal" v={gbp(sel.subtotal)} />
                <Row k="VAT (20%)" v={gbp(sel.vat)} />
                <div className="fx jb" style={{ padding: '8px 0', fontSize: 15 }}><span style={{ fontWeight: 800 }}>Total</span><span className="mono" style={{ fontWeight: 800 }}>{gbp(sel.total)}</span></div>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
