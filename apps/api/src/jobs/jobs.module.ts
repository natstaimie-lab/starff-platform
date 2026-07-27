import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [NotificationsModule, MatchingModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
