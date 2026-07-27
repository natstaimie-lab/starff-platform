import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MatchingService } from './matching.service';
import { JobAnalysisService } from './job-analysis.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('matching')
@ApiBearerAuth()
@Controller('jobs')
@Roles(Role.ADMIN, Role.RECRUITER)
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly analysis: JobAnalysisService,
  ) {}

  /** Structured AI matching profile for a staffing request. */
  @Get(':id/analysis')
  analyse(@Param('id') id: string) {
    return this.analysis.analyse(id);
  }

  /** Ranked candidate recommendations for a job (admin decides who to invite). */
  @Get(':id/recommendations')
  recommend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('explain') explain?: string) {
    return this.matching.recommend(id, { explain: explain === '1' || explain === 'true', actorId: u.id });
  }
}
