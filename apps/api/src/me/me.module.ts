import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentCheckModule } from '../documents/document-check.module';

@Module({
  imports: [NotificationsModule, DocumentCheckModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
