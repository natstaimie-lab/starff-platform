import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { RegistrationModule } from '../registration/registration.module';
import { AiSalesService } from './ai-sales.service';
import { LeadMailer } from './lead-mailer';

/** CRM Phase 2: leads pipeline + activity log (calls, emails, notes). */
@Module({
  imports: [RegistrationModule],
  controllers: [LeadsController],
  providers: [LeadsService, AiSalesService, LeadMailer],
  exports: [LeadsService],
})
export class LeadsModule {}
