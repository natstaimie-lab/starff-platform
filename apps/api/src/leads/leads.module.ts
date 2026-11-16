import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { RegistrationModule } from '../registration/registration.module';
import { AiSalesService } from './ai-sales.service';
import { LeadMailer } from './lead-mailer';
import { AiSalesController } from './ai-sales.controller';
import { InboundController } from './inbound.controller';
import { InboundService } from './inbound.service';

/** CRM Phase 2: leads pipeline + activity log (calls, emails, notes). */
@Module({
  imports: [RegistrationModule],
  controllers: [LeadsController, AiSalesController, InboundController],
  providers: [LeadsService, AiSalesService, LeadMailer, InboundService],
  exports: [LeadsService],
})
export class LeadsModule {}
