import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RatingsModule } from '../ratings/ratings.module';
import { RegistrationModule } from '../registration/registration.module';
import { DocumentCheckModule } from '../documents/document-check.module';

@Module({
  imports: [NotificationsModule, RatingsModule, RegistrationModule, DocumentCheckModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
})
export class CandidatesModule {}
