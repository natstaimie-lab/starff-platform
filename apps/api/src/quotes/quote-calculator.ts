/**
 * Starff quote calculator — CRM Phase 1, step 3.
 *
 * Pure function: no database, no Nest. Takes a booking (pay rate, shifts,
 * hours, number of temps, shift type) and returns the cost breakdown per hour,
 * the client charge rate, the quote total and Starff's profit in £.
 *
 * The on-cost model is the same one used on the Starff Rate Card 2026–27:
 *   cost/hr = pay + holiday + employer NI + pension + sick/insurance buffer
 *   charge/hr = cost/hr + Starff margin (£/hr)
 *
 * Employer NI and pension depend on what one temp earns in a week, so the
 * quote is treated as ONE WEEK of work per temp (shifts x hoursPerShift).
 *
 * All rates live in QuoteSettings so they can later come from the admin-editable
 * rate settings table (Phase 1, step 2) instead of being hard-coded.
 */

export type ShiftType = 'standard' | 'night' | 'weekend' | 'bank_holiday';

export interface QuoteSettings {
  /** Holiday pay as a fraction of pay (5.6 weeks = 12.07%). */
  holidayRate: number;
  /** Employer Class 1 NI rate. */
  employerNiRate: number;
  /** Employer NI secondary threshold, £ per week. */
  niThresholdWeekly: number;
  /** Employer auto-enrolment pension contribution rate. */
  pensionRate: number;
  /** Lower limit of qualifying earnings, £ per week. */
  pensionLowerWeekly: number;
  /** Sick pay / insurance buffer as a fraction of pay. */
  bufferRate: number;
  /** Minimum hours charged per shift. */
  minShiftHours: number;
  /** National Living Wage (21+), £/hr — used for a warning only. */
  minimumWage: number;
  /** Night premium added to pay, £/hr. */
  nightPremiumPerHour: number;
  /** Weekend multiplier on pay (1.10 = +10%). */
  weekendMultiplier: number;
  /** Bank holiday multiplier on pay. */
  bankHolidayMultiplier: number;
}

/** Figures from the Starff Rate Card 2026–27 (check with the accountant). */
export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  holidayRate: 0.1207,
  employerNiRate: 0.15,
  niThresholdWeekly: 96,
  pensionRate: 0.03,
  pensionLowerWeekly: 120,
  bufferRate: 0.01,
  minShiftHours: 4,
  minimumWage: 12.71,
  nightPremiumPerHour: 1.0,
  weekendMultiplier: 1.1,
  bankHolidayMultiplier: 1.5,
};

export interface QuoteInput {
  /** Base pay rate to the worker, £/hr, before any shift premium. */
  payRate: number;
  /** Starff margin, £ per hour charged. */
  marginPerHour: number;
  /** Hours in each shift. Charged at least settings.minShiftHours. */
  hoursPerShift: number;
  /** Shifts each temp works in the week. Default 1. */
  shifts?: number;
  /** Number of temps. Default 1. */
  temps?: number;
  shiftType?: ShiftType;
  /** Is the worker auto-enrolled in the pension? Default true. */
  pensionEnrolled?: boolean;
}

export interface QuoteResult {
  /** Pay to worker after the shift premium, £/hr. */
  effectivePayRate: number;
  /** Per-hour cost lines (unrounded, so they add up exactly). */
  perHour: {
    pay: number;
    holiday: number;
    employerNi: number;
    pension: number;
    buffer: number;
  };
  /** Starff's cost per hour, rounded to the penny. */
  costPerHour: number;
  marginPerHour: number;
  /** What the client pays per hour, rounded to the penny. */
  chargeRate: number;
  /** chargeRate / base payRate — handy for comparing with other agencies. */
  multiplier: number;
  /** Hours charged per shift after the minimum booking rule. */
  chargedHoursPerShift: number;
  /** Total hours on the quote: charged hours x shifts x temps. */
  totalHours: number;
  /** Quote total to the client, £ (Starff is not VAT-registered, so no VAT). */
  total: number;
  /** Starff's total cost, £. */
  totalCost: number;
  /** total - totalCost, £. */
  profit: number;
  warnings: string[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateQuote(
  input: QuoteInput,
  overrides: Partial<QuoteSettings> = {},
): QuoteResult {
  const s: QuoteSettings = { ...DEFAULT_QUOTE_SETTINGS, ...overrides };
  const shifts = input.shifts ?? 1;
  const temps = input.temps ?? 1;
  const shiftType: ShiftType = input.shiftType ?? 'standard';
  const pensionEnrolled = input.pensionEnrolled ?? true;

  const positive = { payRate: input.payRate, hoursPerShift: input.hoursPerShift, shifts, temps };
  for (const [name, v] of Object.entries(positive)) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a number above 0`);
  }
  if (!Number.isInteger(shifts) || !Number.isInteger(temps)) {
    throw new RangeError('shifts and temps must be whole numbers');
  }
  if (!Number.isFinite(input.marginPerHour) || input.marginPerHour < 0) {
    throw new RangeError('marginPerHour must be 0 or more');
  }

  const warnings: string[] = [];
  if (input.payRate < s.minimumWage) {
    warnings.push(`Pay £${input.payRate.toFixed(2)} is below the £${s.minimumWage.toFixed(2)} legal minimum for workers aged 21+.`);
  }

  // 1. Shift premium on pay
  let pay = input.payRate;
  if (shiftType === 'night') pay += s.nightPremiumPerHour;
  else if (shiftType === 'weekend') pay *= s.weekendMultiplier;
  else if (shiftType === 'bank_holiday') pay *= s.bankHolidayMultiplier;

  // 2. Minimum booking
  const chargedHoursPerShift = Math.max(input.hoursPerShift, s.minShiftHours);
  if (chargedHoursPerShift > input.hoursPerShift) {
    warnings.push(`Shift is under ${s.minShiftHours} hours, so ${s.minShiftHours} hours are charged.`);
  }

  // 3. On-costs, worked out on one temp's week
  const weeklyHours = chargedHoursPerShift * shifts;
  const holiday = pay * s.holidayRate;
  const weeklyGross = (pay + holiday) * weeklyHours;
  const employerNi = (s.employerNiRate * Math.max(0, weeklyGross - s.niThresholdWeekly)) / weeklyHours;
  const pension = pensionEnrolled
    ? (s.pensionRate * Math.max(0, weeklyGross - s.pensionLowerWeekly)) / weeklyHours
    : 0;
  const buffer = pay * s.bufferRate;

  if (weeklyGross <= s.niThresholdWeekly) {
    warnings.push(
      `Weekly earnings of £${weeklyGross.toFixed(2)} are under the NI threshold, so no employer NI is priced in. If this temp works other shifts that week, you will pay NI you have not charged for.`,
    );
  }

  // 4. Rates and totals (rates rounded to the penny, totals from rounded rates)
  const costPerHour = round2(pay + holiday + employerNi + pension + buffer);
  const marginPerHour = round2(input.marginPerHour);
  const chargeRate = round2(costPerHour + marginPerHour);
  const totalHours = chargedHoursPerShift * shifts * temps;
  const total = round2(chargeRate * totalHours);
  const totalCost = round2(costPerHour * totalHours);

  return {
    effectivePayRate: round2(pay),
    perHour: { pay, holiday, employerNi, pension, buffer },
    costPerHour,
    marginPerHour,
    chargeRate,
    multiplier: round2(chargeRate / input.payRate),
    chargedHoursPerShift,
    totalHours,
    total,
    totalCost,
    profit: round2(total - totalCost),
    warnings,
  };
}
