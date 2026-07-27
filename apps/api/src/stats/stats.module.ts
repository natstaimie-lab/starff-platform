import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { AlertsService } from './alerts.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, AlertsService],
})
export class StatsModule {}
