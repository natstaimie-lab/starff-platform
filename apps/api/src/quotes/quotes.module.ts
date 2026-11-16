import { Module } from '@nestjs/common';
import { RateSettingsService } from './rate-settings.service';
import { RateSettingsController } from './rate-settings.controller';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';

/** CRM Phase 1: quote calculator, rate settings and saved quotes. */
@Module({
  // RateSettingsController first: its fixed paths must win over quotes/:id.
  controllers: [RateSettingsController, QuotesController],
  providers: [RateSettingsService, QuotesService],
  exports: [RateSettingsService, QuotesService],
})
export class QuotesModule {}
