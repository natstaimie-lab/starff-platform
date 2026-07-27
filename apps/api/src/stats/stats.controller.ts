import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StatsService } from './stats.service';
import { AlertsService } from './alerts.service';
import { Roles } from '../auth/roles.decorator';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
@Roles(Role.ADMIN, Role.RECRUITER)
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly alerts: AlertsService,
  ) {}

  @Get('overview')
  overview() {
    return this.stats.overview();
  }

  @Get('workflow')
  workflow() {
    return this.stats.workflow();
  }

  @Get('compliance')
  compliance() {
    return this.stats.compliance();
  }

  @Get('trends')
  trends() {
    return this.stats.trends();
  }

  @Get('alerts')
  alertsList() {
    return this.alerts.getAlerts();
  }
}
