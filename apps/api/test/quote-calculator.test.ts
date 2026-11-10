/**
 * Hand-worked checks for the quote calculator.
 * Run: node --test apps/api/test/quote-calculator.test.ts   (Node 22.18+)
 *
 * Each example shows the working, so if a test fails you can see which line moved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from '../src/quotes/quote-calculator.ts';

const close = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < 0.000001, `${label}: got ${actual}, expected ${expected}`);

test('1. Warehouse operative, standard week: £13.00 pay, 5 x 8h, 1 temp, £1.75 margin', () => {
  // holiday   13.00 x 12.07%                         = 1.5691
  // gross/wk  (13.00 + 1.5691) x 40                  = 582.764
  // NI/hr     15% x (582.764 - 96) / 40              = 1.825365
  // pension   3% x (582.764 - 120) / 40              = 0.347073
  // buffer    13.00 x 1%                             = 0.13
  // cost/hr   13 + 1.5691 + 1.825365 + 0.347073 + 0.13 = 16.871538 -> £16.87
  // charge    16.87 + 1.75 = £18.62 (matches the Rate Card)
  // total     18.62 x 40 = £744.80, cost 16.87 x 40 = £674.80, profit £70.00
  const q = calculateQuote({ payRate: 13, marginPerHour: 1.75, hoursPerShift: 8, shifts: 5 });
  close(q.perHour.holiday, 1.5691, 'holiday');
  close(q.perHour.employerNi, 1.825365, 'NI');
  close(q.perHour.pension, 0.347073, 'pension');
  assert.equal(q.costPerHour, 16.87);
  assert.equal(q.chargeRate, 18.62);
  assert.equal(q.multiplier, 1.43);
  assert.equal(q.totalHours, 40);
  assert.equal(q.total, 744.8);
  assert.equal(q.totalCost, 674.8);
  assert.equal(q.profit, 70);
  assert.deepEqual(q.warnings, []);
});

test('2. Event stewards, one 3h Saturday shift, 10 temps: weekend +10%, 4h minimum, under NI threshold', () => {
  // pay       13.25 x 1.10                           = 14.575
  // hours     3h booked -> 4h charged
  // holiday   14.575 x 12.07%                        = 1.7592025
  // gross/wk  (14.575 + 1.7592025) x 4               = 65.33681  -> under £96 NI and £120 pension
  // buffer    14.575 x 1%                            = 0.14575
  // cost/hr   14.575 + 1.7592025 + 0.14575           = 16.4799525 -> £16.48
  // charge    16.48 + 2.25 = £18.73
  // hours     4 x 1 x 10 = 40; total £749.20, cost £659.20, profit £90.00
  const q = calculateQuote({
    payRate: 13.25, marginPerHour: 2.25, hoursPerShift: 3, shifts: 1, temps: 10, shiftType: 'weekend',
  });
  assert.equal(q.effectivePayRate, 14.58); // 14.575 shown rounded
  assert.equal(q.chargedHoursPerShift, 4);
  assert.equal(q.perHour.employerNi, 0);
  assert.equal(q.perHour.pension, 0);
  assert.equal(q.costPerHour, 16.48);
  assert.equal(q.chargeRate, 18.73);
  assert.equal(q.totalHours, 40);
  assert.equal(q.total, 749.2);
  assert.equal(q.totalCost, 659.2);
  assert.equal(q.profit, 90);
  assert.equal(q.warnings.length, 2); // minimum hours + NI threshold
});

test('3. Forklift drivers, nights: £15.50 + £1.00 night premium, 4 x 10h, 3 temps, £2.50 margin', () => {
  // pay       15.50 + 1.00                           = 16.50
  // holiday   16.50 x 12.07%                         = 1.99155
  // gross/wk  (16.50 + 1.99155) x 40                 = 739.662
  // NI/hr     15% x 643.662 / 40                     = 2.4137325
  // pension   3% x 619.662 / 40                      = 0.4647465
  // buffer    0.165
  // cost/hr   = 21.535029 -> £21.54; charge £24.04
  // hours     40 x 3 = 120; total £2,884.80, cost £2,584.80, profit £300.00
  const q = calculateQuote({
    payRate: 15.5, marginPerHour: 2.5, hoursPerShift: 10, shifts: 4, temps: 3, shiftType: 'night',
  });
  assert.equal(q.effectivePayRate, 16.5);
  close(q.perHour.employerNi, 2.4137325, 'NI');
  close(q.perHour.pension, 0.4647465, 'pension');
  assert.equal(q.costPerHour, 21.54);
  assert.equal(q.chargeRate, 24.04);
  assert.equal(q.totalHours, 120);
  assert.equal(q.total, 2884.8);
  assert.equal(q.totalCost, 2584.8);
  assert.equal(q.profit, 300);
});

test('4. Cleaners, bank holiday: £13.00 x 1.5, one 6h shift, 2 temps, not in pension', () => {
  // pay       13.00 x 1.5                            = 19.50
  // holiday   19.50 x 12.07%                         = 2.35365
  // gross/wk  (19.50 + 2.35365) x 6                  = 131.1219
  // NI/hr     15% x (131.1219 - 96) / 6              = 0.8780475
  // pension   0 (not enrolled)
  // buffer    0.195
  // cost/hr   = 22.9266975 -> £22.93; charge £24.68
  // hours     6 x 2 = 12; total £296.16, cost £275.16, profit £21.00
  const q = calculateQuote({
    payRate: 13, marginPerHour: 1.75, hoursPerShift: 6, temps: 2, shiftType: 'bank_holiday', pensionEnrolled: false,
  });
  close(q.perHour.employerNi, 0.8780475, 'NI');
  assert.equal(q.perHour.pension, 0);
  assert.equal(q.costPerHour, 22.93);
  assert.equal(q.chargeRate, 24.68);
  assert.equal(q.total, 296.16);
  assert.equal(q.totalCost, 275.16);
  assert.equal(q.profit, 21);
});

test('Warns when pay is below the legal minimum', () => {
  const q = calculateQuote({ payRate: 12, marginPerHour: 1.75, hoursPerShift: 8, shifts: 5 });
  assert.match(q.warnings[0], /below the £12.71 legal minimum/);
});

test('Settings can be overridden (e.g. from the rate settings table)', () => {
  const q = calculateQuote(
    { payRate: 13, marginPerHour: 1.75, hoursPerShift: 8, shifts: 5 },
    { bufferRate: 0 },
  );
  assert.equal(q.costPerHour, 16.74); // 16.871538 - 0.13
});

test('Rejects bad input', () => {
  assert.throws(() => calculateQuote({ payRate: 0, marginPerHour: 1, hoursPerShift: 8 }), RangeError);
  assert.throws(() => calculateQuote({ payRate: 13, marginPerHour: -1, hoursPerShift: 8 }), RangeError);
  assert.throws(() => calculateQuote({ payRate: 13, marginPerHour: 1, hoursPerShift: 8, temps: 1.5 }), RangeError);
});

test('Stored rate settings (percentages) convert to calculator settings correctly', async () => {
  const { toQuoteSettings } = await import('../src/quotes/to-quote-settings.ts');
  // Same figures as DEFAULT_RATES in rate-settings.service.ts
  const stored = {
    holidayPct: 12.07, employerNiPct: 15, niThresholdWeekly: 96, pensionPct: 3, pensionLowerWeekly: 120,
    bufferPct: 1, defaultMarginPerHour: 1.75, minimumWage: 12.71, londonLivingWage: 15.45,
  };
  const q = calculateQuote(
    { payRate: 13, marginPerHour: stored.defaultMarginPerHour, hoursPerShift: 8, shifts: 5 },
    toQuoteSettings(stored),
  );
  assert.equal(q.chargeRate, 18.62); // same as example 1
  assert.equal(q.profit, 70);
});
