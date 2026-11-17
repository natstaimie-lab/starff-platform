import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ProspectingService } from './prospecting.service';

class RejectSuggestionDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

/** CRM Phase 4d: suggested leads found through Apollo. Staff accept or reject each one. */
@ApiTags('prospecting')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.RECRUITER)
@Controller('prospecting')
export class ProspectingController {
  constructor(private readonly p: ProspectingService) {}

  @Get('summary')
  summary() {
    return this.p.summary();
  }

  /** status=pending (default) or done (accepted / rejected in the last 30 days). */
  @Get('suggestions')
  list(@Query('status') status?: string) {
    if (status && !['pending', 'done'].includes(status)) throw new BadRequestException('status must be pending or done');
    return this.p.list(status === 'done' ? 'DONE' : 'PENDING');
  }

  /** Find suggestions now, up to what is left of this week's cap. */
  @Post('run')
  @HttpCode(200)
  run(@CurrentUser() u: AuthUser) {
    return this.p.run('manual', u.id);
  }

  @Post('suggestions/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.p.accept(id, u.id);
  }

  @Post('suggestions/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RejectSuggestionDto) {
    return this.p.reject(id, dto.reason, u.id);
  }
}
