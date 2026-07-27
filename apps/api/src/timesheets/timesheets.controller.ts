import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TimesheetStatus } from '@prisma/client';
import { TimesheetsService } from './timesheets.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('timesheets')
@ApiBearerAuth()
@Controller('timesheets')
@Roles(Role.ADMIN, Role.RECRUITER)
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get()
  findAll(@Query('status') status?: TimesheetStatus) {
    return this.timesheets.findAll(status);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.timesheets.approve(id, user.id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.timesheets.reject(id, reason);
  }
}
