import type { QuoteSettings } from './quote-calculator';
import type { RateSettingValues } from './rate-settings.service';

/** Turn the stored settings (percentages as 12.07) into calculator settings (fractions as 0.1207). */
export function toQuoteSettings(v: RateSettingValues): Partial<QuoteSettings> {
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
