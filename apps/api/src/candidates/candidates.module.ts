import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [NotificationsModule, RatingsModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
})
export class CandidatesModule {}
