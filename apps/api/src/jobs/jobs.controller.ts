import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ApproveJobDto, InviteCandidatesDto, RejectJobDto, SubmitToClientDto, UpdateJobStatusDto } from './dto/review-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
@Roles(Role.ADMIN, Role.RECRUITER)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  findAll() {
    return this.jobs.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobs.findOne(id);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.jobs.update(id, dto, u.id);
  }

  // ── admin review gate ──
  @Patch(':id/status')
  setStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateJobStatusDto) {
    return this.jobs.setStatus(id, dto.status, u.id);
  }

  @Post(':id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ApproveJobDto) {
    return this.jobs.approve(id, dto, u.id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RejectJobDto) {
    return this.jobs.reject(id, dto, u.id);
  }

  @Post(':id/request-info')
  requestInfo(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RejectJobDto) {
    return this.jobs.requestInfo(id, dto, u.id);
  }

  @Post(':id/end')
  endRecurring(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.jobs.endRecurring(id, u.id);
  }

  @Post(':id/invite')
  invite(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: InviteCandidatesDto) {
    return this.jobs.invite(id, dto.candidateIds, dto.responseDeadline, u.id);
  }

  @Post(':id/submit-to-client')
  submitToClient(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SubmitToClientDto) {
    return this.jobs.submitToClient(id, dto.applicationIds, dto.summaries, u.id);
  }
}
