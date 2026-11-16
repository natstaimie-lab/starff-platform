import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { LeadActivityType, LeadStage, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { LeadsService } from './leads.service';
import { AiDraftDto, UnsubscribeLeadDto, ChangeStageDto, ConvertLeadDto, CreateLeadDto, LogActivityDto, SendLeadEmailDto, UpdateLeadDto } from './dto/lead.dto';
import { AiSalesService } from './ai-sales.service';

class ArchiveDto {
  @IsBoolean() archived: boolean;
}

/**
 * CRM leads — staff only. The three actions the AI salesperson will call are
 * POST /leads (create lead), POST /leads/:id/activities (log activity) and
 * PATCH /leads/:id/stage (change stage).
 */
@ApiTags('leads')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.RECRUITER)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService, private readonly aiSales: AiSalesService) {}

  @Get()
  list(
    @Query('stage') stage?: string,
    @Query('q') q?: string,
    @Query('ownerId') ownerId?: string,
    @Query('clientId') clientId?: string,
    @Query('due') due?: string,
    @Query('archived') archived?: string,
  ) {
    if (stage && !(stage in LeadStage)) throw new BadRequestException('Unknown stage');
    return this.leads.list({
      stage: stage as LeadStage | undefined,
      q,
      ownerId: ownerId || undefined,
      clientId: clientId || undefined,
      dueBefore: due === 'true' ? new Date() : undefined,
      includeArchived: archived === 'true',
    });
  }

  /** Counts per stage + follow-ups due. Fixed path, so it sits before :id. */
  @Get('summary')
  summary() {
    return this.leads.summary();
  }

  /** Today list: open leads grouped by follow-up (overdue, today, next 7 days, later, none). */
  @Get('today')
  today() {
    return this.leads.today();
  }

  /** Create lead. Idempotent per enquiryId. */
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(dto, u.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.leads.get(id);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto, u.id);
  }

  @Get(':id/activities')
  activities(@Param('id') id: string, @Query('type') type?: string) {
    if (type && !(type in LeadActivityType)) throw new BadRequestException('Unknown activity type');
    return this.leads.listActivities(id, type as LeadActivityType | undefined);
  }

  /** Log activity: a call, email, note or meeting. */
  @Post(':id/activities')
  logActivity(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LogActivityDto) {
    return this.leads.logActivity(id, dto, u.id);
  }

  /** Change stage. LOST needs a reason. */
  @Patch(':id/stage')
  changeStage(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChangeStageDto) {
    return this.leads.changeStage(id, dto, u.id);
  }

  /**
   * Convert to client: creates (or reuses) the client, sets up the contact's
   * portal login and emails it, copies the accepted quote's rates as agreed
   * rates, and marks the lead Won.
   */
  /** Duplicate check for the convert box: possible existing clients for this lead. */
  @Get(':id/convert-check')
  convertCheck(@Param('id') id: string, @Query('email') email?: string) {
    return this.leads.convertCheck(id, email);
  }

  @Post(':id/convert')
  @HttpCode(200)
  convert(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leads.convert(id, dto, u.id);
  }

  /** AI salesperson: draft a follow-up email + call script for this lead. Saves and sends nothing. */
  @Post(':id/ai-draft')
  @HttpCode(200)
  aiDraft(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AiDraftDto) {
    return this.aiSales.draftFollowUp(id, u.id, dto.instructions);
  }

  /** Send an email to the lead's contact and log it (used for AI drafts after review). */
  @Post(':id/email')
  @HttpCode(200)
  sendEmail(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SendLeadEmailDto) {
    return this.leads.sendEmail(id, dto, u);
  }

  /** Do-not-email on/off (every lead sharing the email). */
  @Patch(':id/unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UnsubscribeLeadDto) {
    return this.leads.setUnsubscribed(id, dto.unsubscribed, dto.note, u.id);
  }

  @Patch(':id/archive')
  @HttpCode(200)
  archive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ArchiveDto) {
    return this.leads.setArchived(id, dto.archived, u.id);
  }
}
