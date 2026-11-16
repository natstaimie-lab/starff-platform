'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    apiFetch<{ settings: RateSettingValues }>('/quotes/rate-settings')
      .then((r) => {
        setRates(r.settings);
        // Start the margin box on the default margin from Settings.
        setForm((f) => (f.marginPerHour === '' ? { ...f, marginPerHour: r.settings.defaultMarginPerHour.toFixed(2) } : f));
      })
      .catch((e) => setLoadError(e?.message || 'Could not load rate settings'));
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

  if (loadError) {
    return <Card title="Quote calculator"><p style={{ color: 'var(--error-600, #c0392b)' }}>{loadError}</p></Card>;
  }

  const p = result?.perHour;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <Card title="Booking details" subtitle="Change any figure — the breakdown updates as you type">
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
  );
}
