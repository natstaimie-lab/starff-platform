import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiSalesService } from './ai-sales.service';
import { SendAiDraftDto, SkipAiDraftDto } from './dto/lead.dto';

/**
 * CRM Phase 4b: the AI salesperson's approvals queue. The morning run (07:30
 * weekdays) and "Draft today's list now" fill it; staff send or skip each draft.
 */
@ApiTags('ai-sales')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.RECRUITER)
@Controller('ai-sales')
export class AiSalesController {
  constructor(private readonly ai: AiSalesService) {}

  @Get('summary')
  summary() {
    return this.ai.summary();
  }

  /** status=pending (default) or done (sent / skipped / stale in the last 7 days). */
  @Get('drafts')
  drafts(@Query('status') status?: string) {
    if (status && !['pending', 'done'].includes(status)) throw new BadRequestException('status must be pending or done');
    return this.ai.listDrafts(status === 'done' ? 'DONE' : 'PENDING');
  }

  /** Draft today's due leads now (same rules and daily limit as the 07:30 run). Returns straight away. */
  @Post('run')
  @HttpCode(200)
  run(@CurrentUser() u: AuthUser) {
    return this.ai.runDaily('manual', u.id);
  }

  @Post('drafts/:id/send')
  @HttpCode(200)
  send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SendAiDraftDto) {
    return this.ai.sendDraft(id, dto, u);
  }

  @Post('drafts/:id/skip')
  @HttpCode(200)
  skip(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SkipAiDraftDto) {
    return this.ai.skipDraft(id, dto, u.id);
  }
}
