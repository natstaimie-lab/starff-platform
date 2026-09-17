import { Module } from '@nestjs/common';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReliabilityModule } from '../reliability/reliability.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [NotificationsModule, ReliabilityModule, RatingsModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
