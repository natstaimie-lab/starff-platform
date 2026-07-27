import { Module } from '@nestjs/common';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReliabilityModule } from '../reliability/reliability.module';

@Module({
  imports: [NotificationsModule, ReliabilityModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
