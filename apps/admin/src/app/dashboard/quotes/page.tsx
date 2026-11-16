'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';
import { calculateQuote, type QuoteResult, type QuoteSettings, type ShiftType } from '@/lib/quoteCalculator';

/** Rate settings as stored by the API (percentages as 12.07, not 0.1207). */
type RateSettingValues = {
  holidayPct: number;
  employerNiPct: number;
  niThresholdWeekly: number;
  pensionPct: number;
  pensionLowerWeekly: number;
  bufferPct: number;
  defaultMarginPerHour: number;
  minimumWage: number;
  londonLivingWage: number;
};

/** Same mapping as apps/api/src/quotes/to-quote-settings.ts. */
function toQuoteSettings(v: RateSettingValues): Partial<QuoteSettings> {
  return {
    holidayRate: v.holidayPct / 100,
    employerNiRate: v.employerNiPct / 100,
    niThresholdWeekly: v.niThresholdWeekly,
    pensionRate: v.pensionPct / 100,
    pensionLowerWeekly: v.pensionLowerWeekly,
    bufferRate: v.bufferPct / 100,
    minimumWage: v.minimumWage,
  };
}

const SHIFT_TYPES: { value: ShiftType; label: string; hint: string }[] = [
  { value: 'standard', label: 'Standard', hint: 'Weekday day shift' },
  { value: 'night', label: 'Night', hint: '+£1.00/hr to pay' },
  { value: 'weekend', label: 'Weekend', hint: 'Pay × 1.10' },
  { value: 'bank_holiday', label: 'Bank holiday', hint: 'Pay × 1.50' },
];

type Form = {
  payRate: string;
  marginPerHour: string;
  hoursPerShift: string;
  shifts: string;
  temps: string;
  shiftType: ShiftType;
  pensionEnrolled: boolean;
};

/** One role on the quote being built (inputs only — the API prices it on save). */
type Line = {
  description: string; payRate: number; marginPerHour: number; hoursPerShift: number;
  shifts: number; temps: number; shiftType: ShiftType; pensionEnrolled: boolean;
};
type ClientOpt = { id: string; name: string };
type SavedQuote = {
  id: string; number: string; status: string; clientId: string | null; prospectName: string | null;
  contactName: string | null; contactEmail: string | null; title: string | null; notes: string | null;
  validUntil: string;
  lines: { description: string; payRate: string; marginPerHour: string; hoursPerShift: string; shifts: number; temps: number; shiftType: ShiftType; pensionEnrolled: boolean }[];
};
type Details = { clientId: string; prospectName: string; contactName: string; contactEmail: string; title: string; validUntil: string; notes: string };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const in30Days = () => { const d = new Date(); d.setDate(d.getDate() + 30); return isoDay(d); };

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 8,
  fontSize: 14, background: 'var(--surface-card)', color: 'var(--text-primary)',
};

function Field({ label, hint, prefix, children }: { label: string; hint?: string; prefix?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="nm" style={{ fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        {prefix && <span className="dim" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>{prefix}</span>}
        {children}
      </div>
      {hint && <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function Row({ label, value, sub, strong, line }: { label: string; value: string; sub?: string; strong?: boolean; line?: boolean }) {
  return (
    <div className="fx jb ac" style={{ padding: '9px 0', borderTop: line ? '1px solid var(--border-strong)' : undefined, borderBottom: line ? undefined : '1px solid var(--border-subtle)', fontSize: 13.5 }}>
      <span>
        <span style={{ fontWeight: strong ? 700 : 500 }}>{label}</span>
        {sub && <span className="dim" style={{ fontSize: 12, marginLeft: 6 }}>{sub}</span>}
      </span>
      <span className="mono" style={{ fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  );
}

export default function QuotesPage() {
  const [rates, setRates] = useState<RateSettingValues | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<Form>({
    payRate: '13.00', marginPerHour: '', hoursPerShift: '8', shifts: '5', temps: '1',
    shiftType: 'standard', pensionEnrolled: true,
  });
  const [copied, setCopied] = useState(false);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [details, setDetails] = useState<Details>({ clientId: '', prospectName: '', contactName: '', contactEmail: '', title: '', validUntil: in30Days(), notes: '' });
  const [editing, setEditing] = useState<{ id: string; number: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const router = useRouter();

  useEffect(() => {
    apiFetch<{ settings: RateSettingValues }>('/quotes/rate-settings')
      .then((r) => {
        setRates(r.settings);
        // Start the margin box on the default margin from Settings.
        setForm((f) => (f.marginPerHour === '' ? { ...f, marginPerHour: r.settings.defaultMarginPerHour.toFixed(2) } : f));
      })
      .catch((e) => setLoadError(e?.message || 'Could not load rate settings'));
    apiFetch<ClientOpt[]>('/clients').then((cs) => setClients(cs.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
    // ?edit=<id> opens a saved draft for editing.
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (editId) {
      apiFetch<SavedQuote>(`/quotes/${editId}`).then((q) => {
        setEditing({ id: q.id, number: q.number });
        setDetails({
          clientId: q.clientId ?? '', prospectName: q.prospectName ?? '', contactName: q.contactName ?? '',
          contactEmail: q.contactEmail ?? '', title: q.title ?? '', validUntil: q.validUntil.slice(0, 10), notes: q.notes ?? '',
        });
        setLines(q.lines.map((l) => ({
          description: l.description, payRate: Number(l.payRate), marginPerHour: Number(l.marginPerHour),
          hoursPerShift: Number(l.hoursPerShift), shifts: l.shifts, temps: l.temps, shiftType: l.shiftType, pensionEnrolled: l.pensionEnrolled,
        })));
      }).catch((e) => setSaveError(e?.message || 'Could not open that quote'));
    }
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setCopied(false); setForm((f) => ({ ...f, [k]: v })); };

  // Recalculated on every keystroke — the calculator is a pure function, no API call.
  const { result, error } = useMemo((): { result: QuoteResult | null; error: string } => {
    if (!rates) return { result: null, error: '' };
    const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
    try {
      return {
        result: calculateQuote(
          {
            payRate: num(form.payRate),
            marginPerHour: num(form.marginPerHour),
            hoursPerShift: num(form.hoursPerShift),
            shifts: num(form.shifts),
            temps: num(form.temps),
            shiftType: form.shiftType,
            pensionEnrolled: form.pensionEnrolled,
          },
          toQuoteSettings(rates),
        ),
        error: '',
      };
    } catch (e: any) {
      const msg = String(e?.message || e)
        .replace('payRate', 'Pay rate').replace('hoursPerShift', 'Hours per shift')
        .replace('marginPerHour', 'Margin').replace(/^shifts and temps/, 'Shifts and temps')
        .replace(/^shifts /, 'Shifts per week ').replace(/^temps /, 'Number of temps ');
      return { result: null, error: msg };
    }
  }, [rates, form]);

  const shiftLabel = SHIFT_TYPES.find((s) => s.value === form.shiftType)!.label;
  const marginPct = result && result.total > 0 ? (result.profit / result.total) * 100 : 0;
  const belowLlw = result && rates && result.effectivePayRate < rates.londonLivingWage;

  async function copyQuote() {
    if (!result) return;
    const lines = [
      'Starff quote',
      `${form.temps} temp(s) × ${form.shifts} shift(s) × ${result.chargedHoursPerShift} hrs (${shiftLabel.toLowerCase()})`,
      `Charge rate: ${gbp(result.chargeRate)} per hour`,
      `Total hours: ${result.totalHours}`,
      `Total: ${gbp(result.total)} (no VAT — Starff is not VAT-registered)`,
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); } catch { alert(lines.join('\n')); }
  }

  const setD = <K extends keyof Details>(k: K, v: Details[K]) => setDetails((d) => ({ ...d, [k]: v }));

  function addLine() {
    if (!result) return;
    setLines((ls) => [...ls, {
      description: description.trim() || `${shiftLabel} shift`,
      payRate: Number(form.payRate), marginPerHour: Number(form.marginPerHour), hoursPerShift: Number(form.hoursPerShift),
      shifts: Number(form.shifts), temps: Number(form.temps), shiftType: form.shiftType, pensionEnrolled: form.pensionEnrolled,
    }]);
    setDescription('');
  }

  function loadLine(i: number) {
    const l = lines[i];
    setDescription(l.description);
    setForm({
      payRate: l.payRate.toFixed(2), marginPerHour: l.marginPerHour.toFixed(2), hoursPerShift: String(l.hoursPerShift),
      shifts: String(l.shifts), temps: String(l.temps), shiftType: l.shiftType, pensionEnrolled: l.pensionEnrolled,
    });
    setLines((ls) => ls.filter((_, j) => j !== i));
  }

  // Each line priced with the same calculator, for the running quote total.
  const priced = useMemo(() => {
    if (!rates) return [];
    return lines.map((l) => { try { return calculateQuote(l, toQuoteSettings(rates)); } catch { return null; } });
  }, [lines, rates]);
  const quoteTotal = priced.reduce((t, r) => t + (r?.total ?? 0), 0);
  const quoteProfit = priced.reduce((t, r) => t + (r?.profit ?? 0), 0);

  async function saveQuote() {
    setSaveError('');
    if (lines.length === 0) { setSaveError('Add at least one line to the quote.'); return; }
    if (!details.clientId && !details.prospectName.trim()) { setSaveError('Choose a client or type a company name.'); return; }
    const body = {
      clientId: details.clientId || undefined,
      prospectName: details.clientId ? undefined : details.prospectName.trim(),
      contactName: details.contactName.trim() || undefined,
      contactEmail: details.contactEmail.trim() || undefined,
      title: details.title.trim() || undefined,
      notes: details.notes.trim() || undefined,
      validUntil: details.validUntil || undefined,
      lines,
    };
    setSaving(true);
    try {
      await apiFetch(editing ? `/quotes/${editing.id}` : '/quotes', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      router.push('/dashboard/quotes/saved');
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save the quote');
    } finally { setSaving(false); }
  }

  if (loadError) {
    return <Card title="Quote calculator"><p style={{ color: 'var(--error-600, #c0392b)' }}>{loadError}</p></Card>;
  }

  const p = result?.perHour;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Calculator + breakdown share the full width; they stack on narrow screens. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <Card title="Booking details" subtitle="Change any figure — the breakdown updates as you type">
        <div style={{ marginBottom: 14 }}>
          <Field label="Role / line description" hint="Shown on the quote, e.g. Warehouse operative">
            <input aria-label="Role / line description" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="Warehouse operative" style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
          <Field label="Pay rate to worker" prefix="£" hint={rates ? `NLW 21+: £${rates.minimumWage.toFixed(2)}` : undefined}>
            <input aria-label="Pay rate to worker" inputMode="decimal" type="number" min={0} step="0.01" value={form.payRate} onChange={(e) => set('payRate', e.target.value)} style={{ ...inputStyle, paddingLeft: 24 }} />
          </Field>
          <Field label="Starff margin per hour" prefix="£" hint={rates ? `Default £${rates.defaultMarginPerHour.toFixed(2)}` : undefined}>
            <input aria-label="Starff margin per hour" inputMode="decimal" type="number" min={0} step="0.05" value={form.marginPerHour} onChange={(e) => set('marginPerHour', e.target.value)} style={{ ...inputStyle, paddingLeft: 24 }} />
          </Field>
          <Field label="Hours per shift" hint="Minimum 4 hours charged">
            <input aria-label="Hours per shift" inputMode="decimal" type="number" min={0} step="0.25" value={form.hoursPerShift} onChange={(e) => set('hoursPerShift', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Shifts per week" hint="Per temp">
            <input aria-label="Shifts per week" inputMode="numeric" type="number" min={1} step={1} value={form.shifts} onChange={(e) => set('shifts', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Number of temps">
            <input aria-label="Number of temps" inputMode="numeric" type="number" min={1} step={1} value={form.temps} onChange={(e) => set('temps', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Shift type" hint={SHIFT_TYPES.find((s) => s.value === form.shiftType)!.hint}>
            <select aria-label="Shift type" value={form.shiftType} onChange={(e) => set('shiftType', e.target.value as ShiftType)} style={inputStyle}>
              {SHIFT_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="fx ac" style={{ gap: 8, marginTop: 16, fontSize: 13.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.pensionEnrolled} onChange={(e) => set('pensionEnrolled', e.target.checked)} />
          Worker is auto-enrolled in the pension
        </label>
        <button className="aibtn" style={{ marginTop: 16, background: 'var(--blue-500)', color: '#fff', border: 'none', opacity: result ? 1 : 0.5 }} disabled={!result} onClick={addLine}>
          + Add to quote
        </button>
        {rates && (
          <p className="dim" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
            On-costs from rate settings: holiday {rates.holidayPct}% · employer NI {rates.employerNiPct}% above £{rates.niThresholdWeekly}/wk ·
            pension {rates.pensionPct}% above £{rates.pensionLowerWeekly}/wk · buffer {rates.bufferPct}%. Worked out on one temp&apos;s week.
          </p>
        )}
      </Card>

      <Card
        title="Quote breakdown"
        subtitle="Per hour, then totals for the whole booking"
        action={result ? <button className="aibtn" onClick={copyQuote}>{copied ? 'Copied ✓' : 'Copy quote'}</button> : undefined}
      >
        {!rates ? <p className="dim">Loading rate settings…</p> : error ? (
          <p role="alert" style={{ color: 'var(--error-600, #c0392b)', fontSize: 13.5 }}>{error}</p>
        ) : result && p && (
          <div aria-live="polite">
            <div className="fx ac jb" style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface-sunken)', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="dim" style={{ fontSize: 12, fontWeight: 600 }}>CHARGE RATE TO CLIENT</div>
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{gbp(result.chargeRate)}<span className="dim" style={{ fontSize: 14, fontWeight: 600 }}> /hr</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="dim" style={{ fontSize: 12, fontWeight: 600 }}>MULTIPLIER</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{result.multiplier.toFixed(2)}×</div>
              </div>
            </div>

            <Row label="Pay to worker" sub={result.effectivePayRate !== Number(form.payRate) ? `${shiftLabel.toLowerCase()} rate` : undefined} value={gbp(p.pay)} />
            <Row label="Holiday pay" value={gbp(p.holiday)} />
            <Row label="Employer NI" value={gbp(p.employerNi)} />
            <Row label="Employer pension" sub={form.pensionEnrolled ? undefined : 'not enrolled'} value={gbp(p.pension)} />
            <Row label="Sick pay / insurance buffer" value={gbp(p.buffer)} />
            <Row label="Cost to Starff" value={gbp(result.costPerHour)} strong line />
            <Row label="Starff margin" value={gbp(result.marginPerHour)} />
            <Row label="Charge rate" value={gbp(result.chargeRate)} strong line />

            <div style={{ height: 14 }} />
            <Row label="Total hours" sub={`${form.temps} × ${form.shifts} × ${result.chargedHoursPerShift} hrs`} value={String(result.totalHours)} />
            <Row label="Quote total" sub="no VAT" value={gbp(result.total)} strong />
            <Row label="Starff cost" value={gbp(result.totalCost)} />
            <Row label="Profit" sub={`${marginPct.toFixed(1)}% of total`} value={gbp(result.profit)} strong />

            {(result.warnings.length > 0 || belowLlw) && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.warnings.map((w) => (
                  <div key={w} className="badge badge-warning" style={{ display: 'block', whiteSpace: 'normal', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.45 }}>{w}</div>
                ))}
                {belowLlw && rates && (
                  <div className="dim" style={{ fontSize: 12.5 }}>Pay is below the London Living Wage (£{rates.londonLivingWage.toFixed(2)}) — fine outside London, but check if the client is an LLW employer.</div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
      </div>

      <div>
        <Card
          title={editing ? `Edit quote ${editing.number}` : 'Quote'}
          subtitle="Add one line per role, then save. Saved quotes are re-priced by the server with the current rates."
          action={<Link href="/dashboard/quotes/saved" className="link" style={{ fontSize: 13, fontWeight: 600 }}>Saved quotes →</Link>}
        >
          {lines.length === 0 ? (
            <p className="dim" style={{ fontSize: 13.5 }}>No lines yet. Fill in the booking details above and click <b>+ Add to quote</b>.</p>
          ) : (
            <table className="tbl" style={{ width: '100%' }}>
              <thead><tr><th>Role</th><th>Booking</th><th style={{ textAlign: 'right' }}>Pay</th><th style={{ textAlign: 'right' }}>Charge /hr</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Profit</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const r = priced[i];
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{l.description}</td>
                      <td className="dim">{l.temps} × {l.shifts} × {r?.chargedHoursPerShift ?? l.hoursPerShift}h · {SHIFT_TYPES.find((s) => s.value === l.shiftType)!.label.toLowerCase()}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{gbp(l.payRate)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r ? gbp(r.chargeRate) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{r ? gbp(r.total) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r ? gbp(r.profit) : '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5 }} onClick={() => loadLine(i)}>Edit</button>
                        <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--error-600, #c0392b)' }} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} style={{ fontWeight: 800 }}>Quote total (no VAT)</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 800 }}>{gbp(quoteTotal)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{gbp(quoteProfit)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 18 }}>
            <Field label="Client">
              <select aria-label="Client" value={details.clientId} onChange={(e) => setD('clientId', e.target.value)} style={inputStyle}>
                <option value="">— New company (not a client yet) —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {!details.clientId && (
              <Field label="Company name">
                <input aria-label="Company name" value={details.prospectName} maxLength={200} onChange={(e) => setD('prospectName', e.target.value)} style={inputStyle} />
              </Field>
            )}
            <Field label="Contact name">
              <input aria-label="Contact name" value={details.contactName} maxLength={200} onChange={(e) => setD('contactName', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Contact email">
              <input aria-label="Contact email" type="email" value={details.contactEmail} onChange={(e) => setD('contactEmail', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Quote title" hint="Optional, e.g. Christmas peak cover">
              <input aria-label="Quote title" value={details.title} maxLength={200} onChange={(e) => setD('title', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Valid until">
              <input aria-label="Valid until" type="date" value={details.validUntil} onChange={(e) => setD('validUntil', e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Notes" hint="Internal notes — not sent anywhere">
              <textarea aria-label="Notes" value={details.notes} maxLength={4000} rows={3} onChange={(e) => setD('notes', e.target.value)} style={{ ...inputStyle, height: 'auto', padding: 10 }} />
            </Field>
          </div>
          {saveError && <p role="alert" style={{ color: 'var(--error-600, #c0392b)', fontSize: 13.5, marginTop: 12 }}>{saveError}</p>}
          <div className="fx ac" style={{ gap: 12, marginTop: 16 }}>
            <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} disabled={saving} onClick={saveQuote}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save quote'}
            </button>
            {editing && <Link href="/dashboard/quotes/saved" className="link" style={{ fontSize: 13 }}>Cancel</Link>}
          </div>
        </Card>
      </div>
    </div>
  );
}
