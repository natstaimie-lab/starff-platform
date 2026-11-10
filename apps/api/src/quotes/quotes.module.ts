import { Module } from '@nestjs/common';
import { RateSettingsService } from './rate-settings.service';
import { RateSettingsController } from './rate-settings.controller';

/** CRM Phase 1: quote calculator. Rate settings now; the calculator and saved quotes come next. */
@Module({
  controllers: [RateSettingsController],
  providers: [RateSettingsService],
  exports: [RateSettingsService],
})
export class QuotesModule {}
