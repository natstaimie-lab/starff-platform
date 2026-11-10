import { Injectable } from '@nestjs/common';
import { RateSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calculateQuote, QuoteInput, QuoteResult } from './quote-calculator';
import { toQuoteSettings } from './to-quote-settings';

/** The quote calculator's figures, as plain numbers. */
export interface RateSettingValues {
  holidayPct: number;
  employerNiPct: number;
  niThresholdWeekly: number;
  pensionPct: number;
  pensionLowerWeekly: number;
  bufferPct: number;
  defaultMarginPerHour: number;
  minimumWage: number;
  londonLivingWage: number;
}

/** Starting values, taken from the Starff Rate Card 2026–27. Check with your accountant. */
export const DEFAULT_RATES: RateSettingValues = {
  holidayPct: 12.07,
  employerNiPct: 15,
  niThresholdWeekly: 96,
  pensionPct: 3,
  pensionLowerWeekly: 120,
  bufferPct: 1,
  defaultMarginPerHour: 1.75,
  minimumWage: 12.71,
  londonLivingWage: 15.45,
};

/** Human labels for the admin settings screen. */
export const RATE_LABELS: Record<keyof RateSettingValues, string> = {
  holidayPct: 'Holiday pay (%)',
  employerNiPct: 'Employer NI (%)',
  niThresholdWeekly: 'NI threshold (£ per week)',
  pensionPct: 'Employer pension (%)',
  pensionLowerWeekly: 'Pension lower earnings limit (£ per week)',
  bufferPct: 'Sick pay / insurance buffer (%)',
  defaultMarginPerHour: 'Default Starff margin (£ per hour)',
  minimumWage: 'National Living Wage, 21+ (£ per hour)',
  londonLivingWage: 'London Living Wage (£ per hour)',
};

const KEYS = Object.keys(DEFAULT_RATES) as (keyof RateSettingValues)[];

function toValues(row: RateSettings): RateSettingValues {
  const out = {} as RateSettingValues;
  KEYS.forEach((k) => { out[k] = Number(row[k]); });
  return out;
}

/** Reads and updates the admin-editable quote rate settings (singleton row). */
@Injectable()
export class RateSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The active settings (creates the default row on first read). */
  async get(): Promise<RateSettingValues> {
    const row = await this.prisma.rateSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default', ...DEFAULT_RATES },
    });
    return toValues(row);
  }

  async update(dto: Partial<RateSettingValues>, actorId?: string): Promise<RateSettingValues> {
    const before = await this.get();
    // Only accept the known keys, as non-negative numbers. Anything else is ignored.
    const data: Partial<RateSettingValues> = {};
    KEYS.forEach((k) => {
      const v = Number(dto[k]);
      if (dto[k] != null && Number.isFinite(v)) data[k] = Math.max(0, v);
    });
    const row = await this.prisma.rateSettings.upsert({
      where: { id: 'default' },
      update: { ...data, updatedById: actorId ?? undefined },
      create: { id: 'default', ...DEFAULT_RATES, ...data, updatedById: actorId ?? undefined },
    });
    const after = toValues(row);
    await this.audit.log({
      actorId, action: 'quotes.rates_changed', entity: 'RateSettings', entityId: 'default',
      meta: JSON.parse(JSON.stringify({ before, after })),
    });
    return after;
  }

  /** Price a booking using the current rate settings. Margin defaults to the settings' default margin. */
  async calculate(input: Omit<QuoteInput, 'marginPerHour'> & { marginPerHour?: number }): Promise<QuoteResult> {
    const v = await this.get();
    return calculateQuote(
      { ...input, marginPerHour: input.marginPerHour ?? v.defaultMarginPerHour },
      toQuoteSettings(v),
    );
  }
}
