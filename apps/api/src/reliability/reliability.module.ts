import { Module } from '@nestjs/common';
import { ReliabilityService } from './reliability.service';
import { ReliabilityController } from './reliability.controller';
import { ReliabilityMeController } from './reliability-me.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReliabilityController, ReliabilityMeController],
  providers: [ReliabilityService],
  exports: [ReliabilityService],
})
export class ReliabilityModule {}
