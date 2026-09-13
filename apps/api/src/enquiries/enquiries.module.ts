import { Module } from '@nestjs/common';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';
import { RegistrationModule } from '../registration/registration.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RegistrationModule, NotificationsModule],
  controllers: [EnquiriesController],
  providers: [EnquiriesService],
})
export class EnquiriesModule {}
