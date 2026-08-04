'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, KPIStat, Badge, DataTable, type Column } from '@/components/ui';
import { Modal, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Timesheet = {
  id: string;
  status: string;
  hoursWorked?: string | null;
  candidate: { firstName: string; lastName: string };
  shift: { startAt: string; endAt: string; payRate: string; chargeRate: string; job: { title: string; client: { id: string; name: string } } };
};
type AggRow = { key: string; name: string; shifts: number; hours: number; amount: number };

type InvoiceRow = {
  id: string; number: string; status: string;
  periodStart: string; periodEnd: string; dueDate?: string | null;
  subtotal: string; vat: string; total: string;
  disputed?: boolean;
  client: { name: string }; _count?: { lines: number };
};
type InvoiceLine = { id: string; description: string; hours: string; rate: string; amount: string };
type FullInvoice = InvoiceRow & {
  client: { name: string; billingEmail?: string | null; addressLine1?: string | null; city?: string | null; postcode?: string | null; paymentTerms?: number | null };
  lines: InvoiceLine[];
  dispute?: { reason: string; at: string } | null;
};
type EditLine = { id: string; description: string; hours: string; rate: string };

const invTone: Record<string, string> = { DRAFT: 'neutral', SENT: 'info', PAID: 'success', OVERDUE: 'warning', VOID: 'error' };
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const gbp = (v?: string | number | null) => (v == null ? '—' : '£' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));
const BILLABLE = ['APPROVED', 'INVOICED', 'PAID'];

export default function PayrollPage() {
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'payroll' | 'invoices'>('payroll');

  const [invList, setInvList] = useState<InvoiceRow[]>([]);
  const [invSel, setInvSel] = useState<FullInvoice | null>(null);
  const [invBusy, setInvBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<EditLine[]>([]);

  const load = () => apiFetch<Timesheet[]>('/timesheets').then(setRows).catch(() => {}).finally(() => setLoading(false));
  const loadInvoices = () => apiFetch<InvoiceRow[]>('/invoices').then(setInvList).catch(() => {});
  useEffect(() => { load(); loadInvoices(); }, []);

  async function generateInvoices() {
    setInvBusy(true);
    try {
      const r = await apiFetch<{ created: number }>('/invoices/generate', { method: 'POST' });
      await Promise.all([loadInvoices(), load()]);
      alert(r.created ? `Created ${r.created} draft invoice${r.created === 1 ? '' : 's'} from approved timesheets.` : 'No approved timesheets to invoice yet.');
    } catch (e: any) { alert(e.message); } finally { setInvBusy(false); }
  }

  async function openInvoice(id: string) {
    setEditing(false);
    try { const inv = await apiFetch<FullInvoice>(`/invoices/${id}`); setInvSel(inv); }
    catch (e: any) { alert(e.message); }
  }

  function startEdit() {
    if (!invSel) return;
    setEditLines(invSel.lines.map((l) => ({ id: l.id, description: l.description, hours: String(l.hours), rate: String(l.rate) })));
    setEditing(true);
  }

  async function saveInvoice() {
    if (!invSel) return;
    setInvBusy(true);
    try {
      await apiFetch(`/invoices/${invSel.id}`, { method: 'PATCH', body: JSON.stringify({ lines: editLines.map((l) => ({ id: l.id, description: l.description, hours: Number(l.hours), rate: Number(l.rate) })) }) });
      const inv = await apiFetch<FullInvoice>(`/invoices/${invSel.id}`);
      setInvSel(inv); setEditing(false); await loadInvoices();
    } catch (e: any) { alert(e.message); } finally { setInvBusy(false); }
  }

  async function invoiceAction(action: 'send' | 'paid' | 'void') {
    if (!invSel) return;
    const verb = action === 'send' ? 'send this invoice to the client' : action === 'paid' ? 'mark this invoice paid' : 'void this invoice';
    if (!confirm(`Are you sure you want to ${verb}?`)) return;
    setInvBusy(true);
    try {
      await apiFetch(`/invoices/${invSel.id}/${action}`, { method: 'PATCH' });
      const inv = await apiFetch<FullInvoice>(`/invoices/${invSel.id}`);
      setInvSel(inv); await loadInvoices();
    } catch (e: any) { alert(e.message); } finally { setInvBusy(false); }
  }

  const editTotals = (() => {
    const sub = editLines.reduce((n, l) => n + (Number(l.hours) || 0) * (Number(l.rate) || 0), 0);
    return { subtotal: sub, vat: sub * 0.2, total: sub * 1.2 };
  })();

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const billable = rows.filter((r) => r.hoursWorked != null && BILLABLE.includes(r.status));

  const agg = (keyOf: (r: Timesheet) => string, rateOf: (r: Timesheet) => number): AggRow[] =>
    Object.values(billable.reduce((acc, r) => {
      const key = keyOf(r); const h = Number(r.hoursWorked);
      acc[key] ??= { key, name: key, shifts: 0, hours: 0, amount: 0 };
      acc[key].shifts++; acc[key].hours += h; acc[key].amount += h * rateOf(r);
      return acc;
    }, {} as Record<string, AggRow>)).sort((a, b) => b.amount - a.amount);
  const payroll = agg((r) => `${r.candidate.firstName} ${r.candidate.lastName}`, (r) => Number(r.shift.payRate));
  const totalPay = payroll.reduce((n, r) => n + r.amount, 0);
  const invCount = (s: string) => invList.filter((i) => i.status === s).length;
  const invoicedTotal = invList.filter((i) => i.status !== 'VOID').reduce((n, i) => n + Number(i.total), 0);
  const outstandingTotal = invList.filter((i) => i.status === 'SENT' || i.status === 'OVERDUE').reduce((n, i) => n + Number(i.total), 0);

  const kpis =
    view === 'payroll' ? [
      { label: 'Workers', value: payroll.length, icon: <Ic.Users width={22} />, tone: 'info' as const },
      { label: 'Billable hours', value: billable.reduce((n, r) => n + Number(r.hoursWorked), 0).toFixed(1), icon: <Ic.Clock width={22} />, tone: 'accent' as const },
      { label: 'Total pay', value: gbp(totalPay), icon: <Ic.PoundSterling width={22} />, tone: 'success' as const },
      { label: 'Pending timesheets', value: count('SUBMITTED'), icon: <Ic.AlertCircle width={22} />, tone: 'accent' as const },
    ] : [
      { label: 'Draft', value: invCount('DRAFT'), icon: <Ic.FileText width={22} />, tone: 'info' as const },
      { label: 'Disputed', value: invList.filter((i) => i.disputed).length, icon: <Ic.AlertCircle width={22} />, tone: 'accent' as const },
      { label: 'Awaiting payment', value: gbp(outstandingTotal), icon: <Ic.Clock width={22} />, tone: 'accent' as const },
      { label: 'Total invoiced', value: gbp(invoicedTotal), icon: <Ic.PoundSterling width={22} />, tone: 'success' as const },
    ];

  const invCols: Column<InvoiceRow>[] = [
    { key: 'number', header: 'Invoice', render: (r) => <span className="nm mono">{r.number}</span> },
    { key: 'client', header: 'Client', render: (r) => <span className="dim">{r.client.name}</span> },
    { key: 'period', header: 'Period', render: (r) => <span className="dim">{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="mono" style={{ fontWeight: 700 }}>{gbp(r.total)}</span> },
    { key: 'status', header: 'Status', render: (r) => (
      <span className="fx ac" style={{ gap: 6 }}>
        <Badge tone={(invTone[r.status] ?? 'neutral') as any}>{r.status}</Badge>
        {r.disputed && <span style={{ background: 'var(--error-100)', color: 'var(--error-600)', borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>⚠ Disputed</span>}
      </span>
    ) },
    { key: 'act', header: '', align: 'right', render: (r) => (
      <button onClick={() => openInvoice(r.id)} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer' }}>
        {r.disputed ? 'Resolve' : r.status === 'DRAFT' ? 'Review' : 'View'}
      </button>
    ) },
  ];
  const aggCols = (who: string, amountHeader: string): Column<AggRow>[] => [
    { key: 'name', header: who, render: (r) => <span className="nm">{r.name}</span> },
    { key: 'shifts', header: 'Shifts', align: 'right', render: (r) => <span className="dim">{r.shifts}</span> },
    { key: 'hours', header: 'Hours', align: 'right', render: (r) => <span className="mono">{r.hours.toFixed(1)}</span> },
    { key: 'amount', header: amountHeader, align: 'right', render: (r) => <span className="mono" style={{ fontWeight: 700 }}>{gbp(r.amount)}</span> },
  ];

  const seg = (v: typeof view): React.CSSProperties => ({
    flex: 1, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
    background: view === v ? 'var(--surface-card)' : 'transparent', color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
    boxShadow: view === v ? '0 1px 3px rgba(11,31,58,.1)' : 'none',
  });

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="fx jb" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="dim">{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
  );

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {kpis.map((k) => <KPIStat key={k.label} label={k.label} value={String(k.value)} icon={k.icon} tone={k.tone} />)}
      </div>

      <div style={{ display: 'inline-flex', gap: 4, background: 'var(--surface-sunken)', padding: 4, borderRadius: 10, margin: '16px 0' }}>
        <button onClick={() => setView('payroll')} style={seg('payroll')}>Payroll</button>
        <button onClick={() => setView('invoices')} style={seg('invoices')}>Invoices</button>
      </div>

      {loading ? <Card><p className="dim">Loading…</p></Card>
        : view === 'payroll' ? (
          <Card title="Payroll" subtitle={`Worker pay from approved timesheets — ${gbp(totalPay)} total`}>
            {payroll.length === 0 ? <p className="dim">No approved timesheets to pay yet.</p> : <DataTable columns={aggCols('Worker', 'Pay')} rows={payroll} />}
            <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>Calculated as approved hours × pay rate. Approve timesheets on the Timesheets tab to include them.</p>
          </Card>
        ) : (
          <Card
            title="Invoices"
            subtitle="Generate, review, edit and send client invoices"
            action={<Button onClick={generateInvoices} disabled={invBusy}>{invBusy ? 'Working…' : 'Generate from approved timesheets'}</Button>}
          >
            {invList.length === 0 ? (
              <p className="dim">No invoices yet. Approve some timesheets, then click <b>Generate from approved timesheets</b> to draft them.</p>
            ) : <DataTable columns={invCols} rows={invList} />}
          </Card>
        )}

      {invSel && (
        <Modal
          title={`Invoice ${invSel.number}`}
          subtitle={`${invSel.client.name}${invSel.client.billingEmail ? ` · ${invSel.client.billingEmail}` : ''}`}
          onClose={() => { setInvSel(null); setEditing(false); }}
          footer={
            editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={invBusy}>Cancel</Button>
                <Button onClick={saveInvoice} disabled={invBusy}>{invBusy ? 'Saving…' : 'Save changes'}</Button>
              </>
            ) : invSel.status === 'DRAFT' ? (
              <>
                <Button variant="outline" onClick={() => invoiceAction('void')} disabled={invBusy}>Void</Button>
                <Button variant="outline" onClick={startEdit} disabled={invBusy}>Edit</Button>
                <Button onClick={() => invoiceAction('send')} disabled={invBusy}>{invBusy ? 'Sending…' : 'Send to client'}</Button>
              </>
            ) : (invSel.status === 'SENT' || invSel.status === 'OVERDUE') && invSel.dispute ? (
              <>
                <Button variant="outline" onClick={() => invoiceAction('void')} disabled={invBusy}>Void</Button>
                <Button variant="outline" onClick={startEdit} disabled={invBusy}>Amend</Button>
                <Button onClick={() => invoiceAction('send')} disabled={invBusy}>{invBusy ? 'Sending…' : 'Re-send corrected'}</Button>
              </>
            ) : invSel.status === 'SENT' || invSel.status === 'OVERDUE' ? (
              <>
                <Button variant="outline" onClick={() => invoiceAction('void')} disabled={invBusy}>Void</Button>
                <Button onClick={() => invoiceAction('paid')} disabled={invBusy}>{invBusy ? 'Saving…' : 'Mark as paid'}</Button>
              </>
            ) : <Button variant="outline" onClick={() => { setInvSel(null); setEditing(false); }}>Close</Button>
          }
        >
          <div className="fx ac jb" style={{ marginBottom: 10 }}>
            <span className="fx ac" style={{ gap: 6 }}>
              <Badge tone={(invTone[invSel.status] ?? 'neutral') as any}>{invSel.status}</Badge>
              {invSel.dispute && <span style={{ background: 'var(--error-100)', color: 'var(--error-600)', borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>⚠ Disputed</span>}
            </span>
            <span className="dim" style={{ fontSize: 12.5 }}>Due {fmtDate(invSel.dueDate)}</span>
          </div>
          {invSel.dispute && !editing && (
            <div style={{ background: 'var(--error-100)', border: '1px solid var(--error-500)', borderRadius: 10, padding: '11px 13px', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--error-600)', marginBottom: 3 }}>Client contested this invoice · {fmtDate(invSel.dispute.at)}</div>
              <div style={{ fontSize: 13 }}>{invSel.dispute.reason}</div>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 5 }}>Amend the lines below and re-send, or void it. Re-sending clears the dispute and notifies the client.</div>
            </div>
          )}
          <Row k="Period" v={`${fmtDate(invSel.periodStart)} – ${fmtDate(invSel.periodEnd)}`} />
          {(invSel.client.addressLine1 || invSel.client.city) && (
            <Row k="Billing address" v={[invSel.client.addressLine1, invSel.client.city, invSel.client.postcode].filter(Boolean).join(', ')} />
          )}

          <div style={{ margin: '16px 0 6px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-secondary)' }}>Line items</div>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {editLines.map((l, i) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 62px 68px 78px', gap: 8, alignItems: 'center' }}>
                  <input value={l.description} onChange={(e) => setEditLines((p) => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    style={{ padding: '7px 9px', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit' }} />
                  <input type="number" step="0.25" min="0" value={l.hours} onChange={(e) => setEditLines((p) => p.map((x, j) => j === i ? { ...x, hours: e.target.value } : x))}
                    style={{ padding: '7px 9px', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: 12.5, textAlign: 'right' }} title="Hours" />
                  <input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => setEditLines((p) => p.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))}
                    style={{ padding: '7px 9px', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: 12.5, textAlign: 'right' }} title="Rate £/hr" />
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{gbp((Number(l.hours) || 0) * (Number(l.rate) || 0))}</span>
                </div>
              ))}
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>Columns: description · hours · rate (£/hr) · amount</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="fx" style={{ gap: 8, padding: '4px 0', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                <span style={{ flex: 1 }}>Description</span><span style={{ width: 46, textAlign: 'right' }}>Hrs</span><span style={{ width: 66, textAlign: 'right' }}>Rate</span><span style={{ width: 78, textAlign: 'right' }}>Amount</span>
              </div>
              {invSel.lines.map((l) => (
                <div key={l.id} className="fx ac" style={{ gap: 8, padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: 12.5 }}>
                  <span style={{ flex: 1 }}>{l.description}</span>
                  <span className="mono" style={{ width: 46, textAlign: 'right' }}>{Number(l.hours)}</span>
                  <span className="mono" style={{ width: 66, textAlign: 'right' }}>{gbp(l.rate)}</span>
                  <span className="mono" style={{ width: 78, textAlign: 'right', fontWeight: 700 }}>{gbp(l.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: '2px solid var(--border-subtle)', paddingTop: 10 }}>
            <Row k="Subtotal" v={gbp(editing ? editTotals.subtotal : invSel.subtotal)} />
            <Row k="VAT (20%)" v={gbp(editing ? editTotals.vat : invSel.vat)} />
            <div className="fx jb" style={{ padding: '8px 0', fontSize: 15 }}><span style={{ fontWeight: 800 }}>Total</span><span className="mono" style={{ fontWeight: 800 }}>{gbp(editing ? editTotals.total : invSel.total)}</span></div>
          </div>
        </Modal>
      )}
    </>
  );
}
